/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

import { ResourceTypesEnum } from '../agent';

export interface IClusterEntity {
  id: string;
  tags: { name: string; value: string }[];
}

export interface ICatalogEntity {
  id: string;
  type: string;
  name: string;
  providerResourceKey: string;
  providerResourceType: string;
  metaTags?: { name: string; value: string; type: string }[];
  providerAccountId?: string;
}

export interface ICatalogEntitiesSearchResult {
  totalFound: number;
  pageNumber: number;
  pageSize: number;
  items: ICatalogEntity[];
}

export interface ICreateCatalogResource {
  providerResourceKey: string;
  providerResourceType: ResourceTypesEnum;
  providerAccountId?: string;
  provider: string;
  metaTags: { name: string; value: string; type: string, createdBy: string }[];
  name: string;
  details: any;
  parents?: { id: string; label: string }[];
}

export interface IDeleteCatalogEntitiesBatch {
  deleted: number;
}

export interface IFailedResource {
  providerResourceKey: string;
  status: number;
  error?: string | string[];
}

export interface ICreateCatalogResourcesBatch {
  success: number;
  failures: number;
  items: ICatalogEntity[];
  failed: IFailedResource[];
}
