/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

import * as k8s from '@kubernetes/client-node';
import { Logger } from '../logger';

export enum K8sInformerResourceTypes {
  NAMESPACE = 'namespace',
  POD = 'pod',
}

// This informer is used instead of native k8s informer to reduce amount of data stored in memory
export class K8sInformer {
  private k8sWatch: k8s.Watch;
  private k8sApi: k8s.CoreV1Api;
  private readonly kc: k8s.KubeConfig;
  private listFn: k8s.ListPromise<any>;
  private _changedState: Map<string, any>;
  private _deletedState: Set<string>;
  private _tempChangedState: Map<string, any>;
  private _tempDeletedState: Set<string>;
  private path: string;
  private resourceVersion: string;
  private watch: any;
  private stopped: boolean;
  private stateSyncing: boolean;

  constructor(private type: K8sInformerResourceTypes) {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromCluster();
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sWatch = new k8s.Watch(this.kc);
    this._changedState = new Map<string, object>();
    this._deletedState = new Set<string>();
    this._tempChangedState = new Map<string, object>();
    this._tempDeletedState = new Set<string>();
    this.initInformerByType();
  }

  private initInformerByType() {
    switch (this.type) {
      case K8sInformerResourceTypes.NAMESPACE: {
        this.listFn = () => this.k8sApi.listNamespace();
        this.path = '/api/v1/namespaces';
        break;
      }
      case K8sInformerResourceTypes.POD: {
        this.listFn = () => this.k8sApi.listPodForAllNamespaces();
        this.path = '/api/v1/pods';
        break;
      }
    }
  }

  public getChangedState<T extends k8s.KubernetesObject>(): T[] {
    return [...this._changedState.values()];
  }

  public getDeletedState(): string[] {
    return [...this._deletedState];
  }

  public syncChangedState(changedResourceKey: string) {
    this._changedState.delete(changedResourceKey);
  }

  public syncDeletedState(deletedResourceKey: string) {
    this._deletedState.delete(deletedResourceKey);
  }

  public startStateSync() {
    this.stateSyncing = true;
  }

  public stopStateSync() {
    this._deletedState = new Set([...this._deletedState, ...this._tempDeletedState]);
    this._changedState = new Map([...this._changedState, ...this._tempChangedState]);
    this.stateSyncing = false;

    for (const deletedResourceKey of this._tempDeletedState) {
      this._changedState.delete(deletedResourceKey);
    }

    this._tempDeletedState.clear();
    this._tempChangedState.clear();
  }

  public async getResources<T extends k8s.KubernetesObject>(): Promise<T[]> {
    try {
      Logger.debug(`Fetching initial ${this.type} data...`);

      // TODO add pagination for memory optimisation
      const result = await this.listFn();
      this.resourceVersion = result.body.metadata.resourceVersion;
      return result.body.items;
    } catch (error) {
      Logger.error({
        message: `Unexpected error occurred while listing resources of type ${this.type}`,
        metadata: {
          error,
          path: 'K8sInformer.getResources',
        },
      });
      return [];
    }
  }

  public async start() {
    try {
      this.stopped = false;
      this.watch = await this.k8sWatch.watch(
        this.path,
        { resourceVersion: this.resourceVersion },
        this.eventCallback.bind(this),
        this.doneCallback.bind(this),
      );
    } catch (error) {
      Logger.error({
        message: `Unexpected error occurred on start watching ${this.type}`,
        metadata: {
          error,
          path: 'K8sInformer.start',
        },
      });
      process.nextTick(() => this.start());
    }
  }

  public async stop() {
    this.stopped = true;
    this.stopWatch();
  }

  private stopWatch() {
    if (this.watch) {
      this.watch.removeAllListeners('error');
      this.watch.abort();
      this.watch = null;
    }
  }

  private async doneCallback(error: unknown): Promise<void> {
    this.stopWatch();

    if (
      error &&
      ((error as { statusCode?: number }).statusCode === 410 ||
        (error as { code?: number }).code === 410)
    ) {
      this.resourceVersion = null;
    } else if (error) {
      Logger.error({
        message: `Unexpected error occurred while watching ${this.type}`,
        metadata: {
          error,
          path: 'K8sInformer.doneCallback',
        },
      });
    }

    if (this.stopped) {
      return;
    }

    if (!this.resourceVersion) {
      const result = await this.listFn();
      this.resourceVersion = result.body.metadata?.resourceVersion || '';
    }

    process.nextTick(() => this.start());
  }

  private async eventCallback<T extends k8s.KubernetesObject>(
    phase: string,
    apiObj: T,
  ): Promise<void> {
    switch (phase) {
      case 'ADDED':
      case 'MODIFIED':
        Logger.verbose({
          message: `${this.type} was ${phase}`,
          metadata: {
            objMetadata: apiObj.metadata,
          },
        });
        this.upsertResource(apiObj);
        break;
      case 'DELETED':
        Logger.verbose({
          message: `${this.type} was ${phase}`,
          metadata: {
            objMetadata: apiObj.metadata,
          },
        });
        this.deleteResource(apiObj);
        break;
      case 'ERROR':
        await this.doneCallback(apiObj);
        return;
      default:
        break;
    }
    this.resourceVersion = apiObj.metadata?.resourceVersion ?? '';
  }

  private upsertResource<T extends k8s.KubernetesObject>(apiObj: T) {
    const key = apiObj.metadata?.uid || apiObj.metadata?.name || '';
    const existingResource = this.changedState.get(key);
    if (!existingResource) {
      this.changedState.set(key, apiObj);
    } else {
      const versionChanged =
        apiObj.metadata?.resourceVersion !== (existingResource as T).metadata?.resourceVersion;
      if (versionChanged) {
        this.changedState.set(key, apiObj);
      }
    }
  }

  private deleteResource<T extends k8s.KubernetesObject>(apiObj: T) {
    const key = apiObj.metadata?.uid || apiObj.metadata?.name || '';
    this.changedState.delete(key);
    this.deletedState.add(key);
  }

  private get deletedState() {
    return this.stateSyncing ? this._tempDeletedState : this._deletedState;
  }

  private get changedState() {
    return this.stateSyncing ? this._tempChangedState : this._changedState;
  }
}
