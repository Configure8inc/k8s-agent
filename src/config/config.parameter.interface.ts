/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

export enum ConfigParameterName {
  C8_URL = 'CONFIGURE8_URL',
  C8_API_TOKEN = 'CONFIGURE8_API_TOKEN',
  FREQUENCY_HOURS = 'FREQUENCY_HOURS',
  CLUSTER_RESOURCE_KEY = 'CLUSTER_RESOURCE_KEY',
  PROVIDER_ACCOUNT_ID = 'PROVIDER_ACCOUNT_ID',
}

export interface IConfigParameter {
  name: string;
  required: boolean;
}
