# c8-k8s-agent

![Version: 0.0.10](https://img.shields.io/badge/Version-0.0.10-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 1.0.0](https://img.shields.io/badge/AppVersion-1.0.0-informational?style=flat-square)

A Helm chart for c8 k8s-agent

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| affinity | object | `{}` | affinity |
| fullnameOverride | string | `""` |  |
| image.pullPolicy | string | `"IfNotPresent"` | Image pull policy |
| image.repository | string | `"public.ecr.aws/c8-public/c8-k8s-agent"` | c8 k8s-agent repo |
| image.tag | string | `"latest"` | Overrides the image tag whose default is the latest. |
| imagePullSecrets | list | `[]` | image pull secrets |
| nameOverride | string | `""` |  |
| nodeSelector | object | `{}` | node selector |
| podAnnotations | object | `{}` | pod annotations |
| podSecurityContext | object | `{}` | pod pod security context |
| replicaCount | int | `1` | replica count |
| resources | object | `{"limits":{"cpu":"500m","memory":"512Mi"},"requests":{"cpu":"250m","memory":"512Mi"}}` | Specify resources |
| securityContext | object | `{}` |  |
| serviceAccount.annotations | object | `{}` | Annotations to add to the service account |
| serviceAccount.create | bool | `true` | Specifies whether a service account should be created |
| serviceAccount.name | string | `""` | The name of the service account to use. If not set and create is true, a name is generated using the fullname template |
| tolerations | list | `[]` | tolerations |
| variables.CLUSTER_RESOURCE_KEY | string | `""` | key/value pairs to add as variables to the pod |
| variables.CONFIGURE8_API_TOKEN | string | `""` | API token for accessing public API. The agent will fail on start if this parameter is not specified. We kindly recommend you don't specify this environment as a simple variable. Please use the example above on how to create and put this value as a Kubernetes secret. |
| variables.CONFIGURE8_URL | string | `"https://app.configure8.io/public/v1"` | Url to configure8 public API |
| variables.FREQUENCY_HOURS | string | `"24"` | Data sync frequency. The number of hours for discovery schedule. Cannot be less than 1. |
| variables.LOGGING_LEVEL | string | `"info"` | Agent logging level. Possible options - 'fatal', 'error', 'warn', 'info', 'debug', 'trace' or 'silent'. Be aware - trace log level will be quite verbose, since it will also print cluster changes. |
| variables.PROVIDER_ACCOUNT_ID | string | `""` | Provider account id for the cluster and its resources. If provided, resources will be created with the specified provider account id. |
| variables.variables_from_configmaps | object | `{"configmap_names":[]}` | variables from configmaps |
| variables.variables_from_secrets | object | `{"secrets_names":[]}` | variables from secrets |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.11.0](https://github.com/norwoodj/helm-docs/releases/v1.11.0)