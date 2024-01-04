/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

import { ConfigParameterName, IConfigParameter } from './config.parameter.interface';

export const loadConfig = (): Map<ConfigParameterName, string> => {
  const config = new Map();
  const configParams: IConfigParameter[] = [
    { name: ConfigParameterName.C8_URL, required: false },
    { name: ConfigParameterName.C8_API_TOKEN, required: true },
    { name: ConfigParameterName.FREQUENCY_HOURS, required: false },
    { name: ConfigParameterName.CLUSTER_RESOURCE_KEY, required: false },
    { name: ConfigParameterName.PROVIDER_ACCOUNT_ID, required: true },
  ];

  for (const param of configParams) {
    const value = process.env[param.name];

    if (param.required && !value) {
      throw new Error(`Environment variable ${param.name} has to be set`);
    }

    config.set(param.name, value);
  }

  return config;
};
