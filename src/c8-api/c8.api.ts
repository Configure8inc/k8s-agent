/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

import axios, { AxiosInstance, AxiosResponse, AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { ConfigParameterName } from '../config';
import { Logger } from '../logger';
import { ResourceTypesEnum } from '../agent';
import {
  ICatalogEntitiesSearchResult,
  ICatalogEntity,
  IClusterEntity,
  ICreateCatalogResource,
  ICreateCatalogResourcesBatch,
  IDeleteCatalogEntitiesBatch,
} from './catalog.interface';

export class C8Api {
  public readonly DEFAULT_BATCH_SIZE = 50;
  private readonly DEFAULT_PAGE_SIZE = 100;
  private readonly REQUEST_RETRIES = 3;
  private axiosInstance: AxiosInstance;

  constructor(config: Map<ConfigParameterName, string>) {
    const apiToken = config.get(ConfigParameterName.C8_API_TOKEN);
    const apiUrl = config.get(ConfigParameterName.C8_URL);
    this.axiosInstance = axios.create({
      baseURL: apiUrl,
      headers: {
        'Api-Key': apiToken,
        'Content-Type': 'application/json',
      },
    });
    axiosRetry(this.axiosInstance, { retries: this.REQUEST_RETRIES });
  }

  private async retryLargeUpsertBatch(resources: ICreateCatalogResource[]) {
    const firstBatch = resources.splice(0, resources.length / 2);
    const firstBatchResult = await this.upsertResourcesBatch(firstBatch);
    const secondBatchResult = await this.upsertResourcesBatch(resources);

    if (!firstBatchResult && !secondBatchResult) {
      return;
    }

    const result = {
      success: 0,
      failures: 0,
      items: [],
      failed: [],
    };

    if (firstBatchResult) {
      result.success += firstBatchResult.success;
      result.failures += firstBatchResult.failures;
      result.items.push(...firstBatchResult.items);
      result.failed.push(...firstBatchResult.failed);
    }

    if (secondBatchResult) {
      result.success += secondBatchResult.success;
      result.failures += secondBatchResult.failures;
      result.items.push(...secondBatchResult.items);
      result.failed.push(...secondBatchResult.failed);
    }

    return result;
  }

  private onRetry(method) {
    return (retryCount, error) => {
      Logger.warn({
        message: 'Unexpected error occurred on request, retrying...',
        metadata: {
          retryCount,
          error: error.response?.data ?? error.message,
          path: `C8PublicApi.${method}`,
        },
      });
    };
  }

  public async upsertResourcesBatch(resources: ICreateCatalogResource[]) {
    try {
      const { data }: { data: ICreateCatalogResourcesBatch } = await this.axiosInstance.post(
        `catalog/batch/entities/resource`,
        resources,
        {
          'axios-retry': {
            retries: this.REQUEST_RETRIES,
            retryDelay: axiosRetry.exponentialDelay,
            onRetry: this.onRetry('upsertResourcesBatch'),
            retryCondition: error => {
              if (axios.isAxiosError(error) && error.response?.status === 413) {
                return false;
              }
              return axiosRetry.isRetryableError(error);
            },
          },
        } as AxiosRequestConfig,
      );
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 413) {
        Logger.debug('Payload is too large, reducing batch size');
        return await this.retryLargeUpsertBatch(resources);
      }

      Logger.error({
        message: 'Unexpected error occurred while batch creating resources',
        metadata: {
          error: error.response?.data ?? error.message,
          path: 'C8PublicApi.upsertResourcesBatch',
        },
      });
    }
  }

  public async deleteResourcesBatch(ids: string[]): Promise<IDeleteCatalogEntitiesBatch> {
    try {
      const { data }: { data: IDeleteCatalogEntitiesBatch } = await this.axiosInstance.delete(
        `catalog/batch/entities`,
        {
          data: { ids },
          'axios-retry': {
            retries: this.REQUEST_RETRIES,
            retryDelay: axiosRetry.exponentialDelay,
            onRetry: this.onRetry('deleteResourcesBatch'),
          },
        } as AxiosRequestConfig,
      );
      return data;
    } catch (error) {
      Logger.error({
        message: 'Unexpected error occurred while batch deleting resources',
        metadata: {
          error: error.response?.data ?? error.message,
          ids,
          path: 'C8PublicApi.deleteResourcesBatch',
        },
      });
    }
  }

  public async getClusterById(clusterId: string) {
    try {
      const { data } = await this.axiosInstance.get(`catalog/entities/${clusterId}`);
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return;
      }

      Logger.error({
        message: 'Unexpected error occurred while fetching cluster by id',
        metadata: {
          error: error.response?.data ?? error.message,
          clusterId: clusterId,
          path: 'C8PublicApi.getClusterById',
        },
      });
    }
  }

  public async getClusterByResourceKey(
    clusterResourceKey: string,
    providerAccountId: string,
  ): Promise<IClusterEntity> {
    try {
      const { data }: { data: ICatalogEntitiesSearchResult } = await this.axiosInstance.post(
        'catalog/entities',
        {
          propertyFilters: [
            { filterType: 'SIMPLE', name: 'providerResourceKey', value: clusterResourceKey },
          ],
          includeProperties: ['providerAccountId', 'metaTags'],
          types: ['resource'],
        },
      );

      let cluster: ICatalogEntity;

      if (data.totalFound === 0) {
        return;
      } else if (data.totalFound > 1) {
        Logger.warn({
          message: `More than 1 entity has resource key ${clusterResourceKey}. Please make sure that your catalog data is not ambiguous. Check documentation for more details. https://docs.configure8.io/configure8-product-docs/fundamentals/plug-ins/kubernetes-agent#configure-k8s-agent`,
          metadata: {
            foundResources: data.items,
            path: 'C8PublicApi.getClusterByResourceKey',
          },
        });

        cluster =
          data.items.find(resource => resource.providerAccountId === providerAccountId) ??
          data.items[0];
      } else {
        cluster = data.items[0];
      }

      const tags = cluster.metaTags.map(({ name, value }) => ({ name, value }));
      return { id: cluster.id, tags };
    } catch (error) {
      Logger.error({
        message: 'Unexpected error occurred while fetching cluster by resource key',
        metadata: {
          error: error.response?.data ?? error.message,
          clusterResourceKey: clusterResourceKey,
          path: 'C8PublicApi.getClusterByResourceKey',
        },
      });
    }
  }

  public async getCurrentResourceIds(providerAccountId: string) {
    const ids = [];

    try {
      const resourceTypePropertyFilters = Object.values(ResourceTypesEnum).map(resourceType => ({
        name: 'providerResourceType',
        value: resourceType,
      }));
      const request = (pageNumber: number, pageSize: number) =>
        this.axiosInstance.post('catalog/entities', {
          propertyFilters: [
            { filterType: 'SIMPLE', name: 'providerAccountId', value: providerAccountId },
            {
              filterType: 'COMPOUND',
              operand: 'OR',
              propertyFilters: resourceTypePropertyFilters,
            },
          ],
          includeProperties: [],
          types: ['resource'],
          pageNumber,
          pageSize,
        });

      for await (const page of this.paginateRequest<AxiosResponse<ICatalogEntitiesSearchResult>>(
        request,
      )) {
        const pageIds = page.data.items.map(({ id }) => id);
        ids.push(...pageIds);
      }

      return ids;
    } catch (error) {
      Logger.error({
        message: 'Unexpected error occurred while fetching current resources id',
        metadata: {
          error: error.response?.data ?? error.message,
          providerAccountId: providerAccountId,
          path: 'C8PublicApi.getCurrentResourceIds',
        },
      });
      return [];
    }
  }

  private async *paginateRequest<T extends AxiosResponse>(
    request: (pageNumber: number, pageSize: number) => Promise<T>,
  ): AsyncGenerator<T> {
    let hasNext = true;
    let pageNumber = 0;

    while (hasNext) {
      const result = await request(pageNumber, this.DEFAULT_PAGE_SIZE);
      pageNumber += 1;

      if (!result.data.totalFound || result.data.totalFound <= result.data.pageSize * pageNumber) {
        hasNext = false;
      }

      yield result;
    }
  }
}
