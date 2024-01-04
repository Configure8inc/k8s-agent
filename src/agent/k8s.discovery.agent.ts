/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

import * as k8s from '@kubernetes/client-node';
import { ConfigParameterName } from '../config';
import { getNestedValuesByKey } from '../utils';
import { C8Api, IClusterEntity, ICreateCatalogResource } from '../c8-api';
import { Logger } from '../logger';
import { K8sInformer, K8sInformerResourceTypes } from './k8s.informer';
import { ResourceTypesEnum } from './resource.types.enum';

export class K8sDiscoveryAgent {
  readonly MAX_FREQUENCY_HOURS = 24 * 24;
  readonly DEFAULT_FREQUENCY_HOURS = 24;
  readonly PROVIDER = 'K8s';

  private cluster: IClusterEntity;
  private readonly clusterResourceKey: string;
  private readonly providerAccountId: string;
  private readonly frequencyHours: number;
  private idsCache: Map<string, string>;
  private namespaceTags: Map<string, { name: string; value: string; type: string, createdBy: string, }[]>;
  private namespaceKeyMapping: Map<string, string>;

  private namespaceInformer: K8sInformer;
  private podsInformer: K8sInformer;

  constructor(config: Map<ConfigParameterName, string>, private c8Api: C8Api) {
    this.clusterResourceKey = config.get(ConfigParameterName.CLUSTER_RESOURCE_KEY);
    this.providerAccountId = config.get(ConfigParameterName.PROVIDER_ACCOUNT_ID);
    const frequencyHours = parseInt(config.get(ConfigParameterName.FREQUENCY_HOURS), 10);
    this.frequencyHours =
      isNaN(frequencyHours) || frequencyHours < 1 ? this.DEFAULT_FREQUENCY_HOURS : frequencyHours;

    if (this.frequencyHours > this.toMs(this.MAX_FREQUENCY_HOURS)) {
      // Due to native timeout limitations
      throw new Error('Discovery interval cannot be set to more than 24 days');
    }

    this.idsCache = new Map<string, string>();

    this.namespaceInformer = new K8sInformer(K8sInformerResourceTypes.NAMESPACE);
    this.podsInformer = new K8sInformer(K8sInformerResourceTypes.POD);

    if (!this.clusterResourceKey) {
      Logger.warn(
        `Cluster resource key is not provided. Setting up parent-child relations for pods and namespaces will be skipped. Check documentation for more details. https://docs.configure8.io/configure8-product-docs/fundamentals/plug-ins/kubernetes-agent#configure-k8s-agent`,
      );
    }
  }

  public async run() {
    Logger.info('Starting initial data synchronization...');

    if (this.clusterResourceKey) {
      await this.checkClusterExists();
    }

    const namespaces = await this.namespaceInformer.getResources();

    Logger.debug('Setting up watching namespaces...');
    await this.namespaceInformer.start();
    Logger.debug(`Setup is completed, now cluster's namespaces are being watched`);

    const { namespaceTags, namespaceKeyMapping } = await this.catalogNamespaces(namespaces);
    this.namespaceTags = namespaceTags;
    this.namespaceKeyMapping = namespaceKeyMapping;

    const pods = await this.podsInformer.getResources();

    Logger.debug('Setting up watching pods...');
    await this.podsInformer.start();
    Logger.debug(`Setup is completed, now cluster's pods are being watched`);

    await this.catalogPods(pods);

    await this.removeInitialDeprecatedResources();

    Logger.info('Initial data synchronization is completed');

    await this.scheduleStateSync();
  }

  private async scheduleStateSync() {
    const frequencyMs = this.toMs(this.frequencyHours);

    Logger.info(
      `Cluster state synchronisation is scheduled to run every ${this.frequencyHours} hours`,
    );

    while (true) {
      await new Promise(resolve => setTimeout(resolve, frequencyMs));
      await this.syncClusterState();
    }
  }

  private async syncClusterState() {
    Logger.info('Synchronising cluster state...');

    if (this.clusterResourceKey) {
      await this.checkClusterExists();
    }

    await this.syncNamespacesState();
    await this.syncPodsState();

    Logger.info('Synchronising cluster state is completed');
  }

  private async syncNamespacesState() {
    this.namespaceInformer.startStateSync();

    const toDeleteNamespaces = this.namespaceInformer.getDeletedState();
    const deletedNamespaceKeys = await this.removeDeprecatedResourcesByKeys(
      toDeleteNamespaces,
      'namespaces',
    );

    for (const key of deletedNamespaceKeys) {
      // remove from cache values by key that was deleted
      this.idsCache.delete(key);
      this.namespaceTags.delete(key);
      this.namespaceInformer.syncDeletedState(key);

      for (const [namespaceName, namespaceKey] of this.namespaceKeyMapping.entries()) {
        if (namespaceKey === key) {
          this.namespaceKeyMapping.delete(namespaceName);
          break;
        }
      }
    }

    const changedNamespaces = this.namespaceInformer.getChangedState();
    const { namespaceTags, namespaceKeyMapping, upsertedNamespaces } = await this.catalogNamespaces(
      changedNamespaces,
    );

    for (const [key, tags] of namespaceTags.entries()) {
      this.namespaceTags.set(key, tags);
    }

    for (const [name, key] of namespaceKeyMapping.entries()) {
      this.namespaceKeyMapping.set(name, key);
    }

    for (const upsertedNamespaceKey of upsertedNamespaces) {
      this.namespaceInformer.syncChangedState(upsertedNamespaceKey);
    }

    this.namespaceInformer.stopStateSync();
  }

  private async syncPodsState() {
    this.podsInformer.startStateSync();

    const toDeletePods = this.podsInformer.getDeletedState();
    const deletedPodKeys = await this.removeDeprecatedResourcesByKeys(toDeletePods, 'pods');

    for (const key of deletedPodKeys) {
      // remove from cache values by key that was deleted
      this.idsCache.delete(key);
      this.podsInformer.syncDeletedState(key);
    }

    const changedPods = this.podsInformer.getChangedState();
    const upsertedPods = await this.catalogPods(changedPods);

    for (const upsertedPodKey of upsertedPods) {
      this.podsInformer.syncChangedState(upsertedPodKey);
    }

    this.podsInformer.stopStateSync();
  }

  private async checkClusterExists() {
    Logger.debug('Check if cluster exists in catalog...');

    if (this.cluster?.id) {
      const cluster = await this.c8Api.getClusterById(this.cluster.id);

      if (cluster) {
        return;
      }

      Logger.warn({
        message: `Cluster with id ${this.cluster.id} does not exist. Trying to update cluster id using cluster resource key...`,
        metadata: {
          clusterId: this.cluster.id,
          path: 'K8sDiscoveryAgent.checkClusterExists',
        },
      });

      this.cluster = null;
    }

    const cluster = await this.c8Api.getClusterByResourceKey(
      this.clusterResourceKey,
      this.providerAccountId,
    );

    if (!cluster) {
      Logger.warn({
        message: `Cluster with provider resource key ${this.clusterResourceKey} does not exist. Setting up parent-child relations for pods and namespaces will be skipped`,
        metadata: {
          clusterResourceKey: this.clusterResourceKey,
          path: 'K8sDiscoveryAgent.checkClusterExists',
        },
      });
      return;
    }

    this.cluster = cluster;
  }

  private async catalogNamespaces(namespaces: k8s.V1Namespace[]) {
    const namespaceTags: Map<string, { name: string; value: string; type: string, createdBy: string }[]> = new Map();
    const namespaceKeyMapping: Map<string, string> = new Map();

    if (!namespaces?.length) {
      return {
        namespaceTags,
        namespaceKeyMapping,
        upsertedNamespaces: [],
      };
    }

    Logger.debug(`Creating namespace resources...`);

    const resources = [];

    for (const namespace of namespaces) {
      const { metadata, ...rest } = namespace;
      const {
        name,
        labels = {} as { [key: string]: string },
        managedFields: [{ subresource: _skip, ...managedFieldsData }] = [{}],
      } = metadata;

      const namespaceName = name || labels['kubernetes.io/metadata.name'];
      const namespaceKey = metadata.uid;
      const metaTags = Object.entries(labels).map(([name, value]) => ({
        name,
        value,
        type: 'AutoMap',
        createdBy: 'SYSTEM',
      }));
      const metadataTagExists = metaTags.find(({ name }) => name === 'kubernetes.io/metadata.name');

      if (!metadataTagExists) {
        metaTags.push({
          name: 'kubernetes.io/metadata.name',
          value: namespaceName,
          type: 'AutoMap',
          createdBy: 'SYSTEM',
        });
      }

      namespaceTags.set(namespaceKey, metaTags);
      namespaceKeyMapping.set(namespaceName, namespaceKey);

      const resource: ICreateCatalogResource = {
        providerResourceKey: namespaceKey,
        metaTags,
        name: namespaceName,
        providerResourceType: ResourceTypesEnum.NAMESPACE,
        provider: this.PROVIDER,
        providerAccountId: this.providerAccountId,
        details: { ...metadata, ...managedFieldsData, config: rest },
      };

      if (this.cluster) {
        resource.parents = [{ id: this.cluster.id, label: 'child_of' }];
        resource.details.tags = this.cluster.tags;
      }

      resources.push(resource);
    }

    const upsertedNamespaces = await this.catalogResources(resources, 'namespaces');
    return {
      namespaceTags,
      namespaceKeyMapping,
      upsertedNamespaces,
    };
  }

  private async catalogPods(pods: k8s.V1Pod[]) {
    if (!pods?.length) {
      return [];
    }

    Logger.debug(`Creating pod resources...`);

    const resources = [];
    const clusterMetaTags = (this.cluster?.tags ?? []).map(({ name, value }) => ({
      name,
      value,
      type: 'AutoMap',
      createdBy: 'SYSTEM',
    }));

    for (const pod of pods) {
      const namespaceResourceKey = this.namespaceKeyMapping.get(pod.metadata.namespace);
      const podResource: ICreateCatalogResource = {
        providerResourceKey: pod.metadata.uid,
        name: `${pod.metadata.namespace} / ${pod.metadata.name}`,
        providerResourceType: ResourceTypesEnum.POD,
        provider: this.PROVIDER,
        providerAccountId: this.providerAccountId,
        details: {
          namespaceLabels: pod.metadata.labels,
          ...pod,
        },
        metaTags: [
          ...getNestedValuesByKey(pod, 'labels').map(data => ({
            ...data,
            type: 'AutoMap',
            createdBy: 'SYSTEM',
          })),
          ...(this.namespaceTags.get(namespaceResourceKey) ?? []),
          ...clusterMetaTags,
        ],
      };

      if (this.clusterResourceKey && this.cluster) {
        podResource.details.ownerId = this.clusterResourceKey;
      }

      if (this.idsCache.has(namespaceResourceKey)) {
        podResource.parents = [{ id: this.idsCache.get(namespaceResourceKey), label: 'child_of' }];
      }

      resources.push(podResource);
    }

    return await this.catalogResources(resources, 'pods');
  }

  private async catalogResources(
    resources: ICreateCatalogResource[],
    resourceType: string,
  ): Promise<string[]> {
    Logger.info(`Attempting to save ${resources.length} ${resourceType}...`);

    const upsertedResources = [];

    while (resources.length > 0) {
      const items = resources.splice(0, this.c8Api.DEFAULT_BATCH_SIZE);
      const result = await this.c8Api.upsertResourcesBatch(items);

      if (!result) {
        // TODO schedule initial sync state
        continue;
      }

      Logger.debug(`Saved ${result.success} ${resourceType}`);

      if (result.failures) {
        Logger.debug({
          message: `Failed to save ${result.failures} ${resourceType}`,
          metadata: {
            failed: result.failed,
          },
        });
      }

      for (const createdResource of result.items) {
        upsertedResources.push(createdResource.providerResourceKey);
        this.idsCache.set(createdResource.providerResourceKey, createdResource.id);
      }
    }

    Logger.info(`Saved ${upsertedResources.length} ${resourceType}`);

    return upsertedResources;
  }

  private async removeInitialDeprecatedResources() {
    Logger.info('Checking for deprecated resources to remove...');

    const oldResourcesIds = await this.c8Api.getCurrentResourceIds(this.providerAccountId);
    const newResourcesIds = [...this.idsCache.values()];
    const toRemove: string[] = [];
    let deletedCount = 0;

    for (const resourceId of oldResourcesIds) {
      if (!newResourcesIds.includes(resourceId)) {
        toRemove.push(resourceId);
      }
    }

    if (!toRemove.length) {
      Logger.info('No deprecated resources found');
      return;
    }

    Logger.info(`Attempting to remove ${toRemove.length} deprecated resources...`);

    while (toRemove.length > 0) {
      const items = toRemove.splice(0, this.c8Api.DEFAULT_BATCH_SIZE);
      const result = await this.c8Api.deleteResourcesBatch(items);
      deletedCount += result?.deleted ?? 0;
    }

    Logger.info(`Removed ${deletedCount} deprecated resources`);
  }

  private async removeDeprecatedResourcesByKeys(
    keys: string[],
    resourceType: string,
  ): Promise<string[]> {
    if (!keys?.length) {
      return [];
    }

    Logger.info(`Attempting to remove ${keys.length} deprecated ${resourceType}...`);

    const deletedResources = [];

    while (keys.length > 0) {
      const toDeleteKeys = keys.splice(0, this.c8Api.DEFAULT_BATCH_SIZE);
      const toDeleteIds = toDeleteKeys
        .filter(key => this.idsCache.has(key))
        .map(key => this.idsCache.get(key));

      if (toDeleteIds.length) {
        const result = await this.c8Api.deleteResourcesBatch(toDeleteIds);
        // check if the batch delete was executed
        if (result?.deleted >= 0) {
          deletedResources.push(...toDeleteKeys);
        }
      } else {
        // if there is no ids in cache for keys, these keys have to be deleted
        deletedResources.push(...toDeleteKeys);
      }
    }

    Logger.info(`Removed ${deletedResources.length} deprecated ${resourceType}`);

    return deletedResources;
  }

  private toMs(hours: number) {
    return hours * 60 * 60 * 1000;
  }
}
