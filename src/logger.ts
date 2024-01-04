/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

import * as pino from 'pino';

interface ILogMessage {
  message: string;
  metadata?: object;
}

export class Logger {
  private static appName = 'Configure8 K8s Agent';
  private static level = this.getLoggingLevel();

  private static getLoggingLevel(): string {
    if (!!process.env.LOGGING_LEVEL) {
      return process.env.LOGGING_LEVEL;
    }

    return 'info';
  }

  private static logger = pino.default({
    name: this.appName,
    level: this.level,
    formatters: {
      level(label) {
        return { level: label };
      },
      bindings() {
        return {};
      },
    },
  });

  public static info(msg: string | ILogMessage): void {
    this.logger.info(this.buildLogMessage(msg));
  }

  public static debug(msg: string | ILogMessage): void {
    this.logger.debug(this.buildLogMessage(msg));
  }

  public static verbose(msg: string | ILogMessage): void {
    this.logger.trace(this.buildLogMessage(msg));
  }

  public static warn(msg: string | ILogMessage): void {
    this.logger.warn(this.buildLogMessage(msg));
  }

  public static error(msg: string | ILogMessage): void {
    this.logger.error(this.buildLogMessage(msg));
  }

  private static buildLogMessage(msg: string | ILogMessage): string | object {
    if (typeof msg === 'string') {
      return msg;
    }

    return {
      message: msg.message,
      metadata: msg.metadata,
      status: this.logger.level,
    };
  }
}
