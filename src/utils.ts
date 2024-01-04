/*********************************************************************************************************************
 *  Copyright 2023 Configure8, Inc. or its affiliates. All Rights Reserved.                                           *
 *********************************************************************************************************************/

/**
 * @author Configure8 Engineering
 */

export const getNestedValuesByKey = (
  obj: { [key: string]: any },
  keyToFind: string,
): { name: string; value: any }[] => {
  const result = [];

  const foundIntermediateData = (obj, keyToFind) => {
    for (const key in obj) {
      if (obj[key]) {
        const isKeyIncluded = key.includes(keyToFind);

        if (isKeyIncluded) {
          if (typeof obj[key] === 'object') {
            for (const [name, value] of Object.entries(obj[key])) {
              if (typeof value === 'object') {
                continue;
              }
              result.push({
                name,
                value,
              });
            }
          } else {
            result.push({
              name: key,
              value: obj[key],
            });
          }
        } else if (typeof obj[key] === 'object') {
          foundIntermediateData(obj[key], keyToFind);
        }
      }
    }
  };

  foundIntermediateData(obj, keyToFind);

  return result;
};
