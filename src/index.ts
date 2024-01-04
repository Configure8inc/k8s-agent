/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

import { loadConfig } from './config';
import { C8Api } from './c8-api';
import { K8sDiscoveryAgent } from './agent';
import { Logger } from './logger';

const run = async () => {
  Logger.info('Starting Configure8 K8s Agent...');
  const config = loadConfig();
  const c8Api = new C8Api(config);
  const k8sDiscoveryAgent = new K8sDiscoveryAgent(config, c8Api);
  await k8sDiscoveryAgent.run();
};

run();
