{{/*
Expand the name of the chart.
*/}}
{{- define "c8-k8s-agent.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "c8-k8s-agent.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "c8-k8s-agent.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "c8-k8s-agent.labels" -}}
helm.sh/chart: {{ include "c8-k8s-agent.chart" . }}
{{ include "c8-k8s-agent.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "c8-k8s-agent.selectorLabels" -}}
app.kubernetes.io/name: {{ include "c8-k8s-agent.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "c8-k8s-agent.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "c8-k8s-agent.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Envs from configMap
*/}}
{{- define "helpers.variables_from_configmaps"}}
{{- range $key  := .Values.variables.variables_from_configmaps.configmap_names }}
- configMapRef:
    name: {{ $key }}
{{- end}}
{{- end }}

{{/*
Envs from secrets
*/}}
{{- define "helpers.variables_from_secrets" }}
{{- range $key  := .Values.variables.variables_from_secrets.secrets_names }}
- secretRef:
    name: {{ $key }}
{{- end }}
{{- end }}

{{/*
Envs CONFIGURE8_API_TOKEN
*/}}
{{- define "addConfigure8APIToken" -}}
{{- $configure8APIToken := default .Values.variables.CONFIGURE8_API_TOKEN "" -}}
{{- if $configure8APIToken -}}
- name: CONFIGURE8_API_TOKEN
  value: {{ quote $configure8APIToken }}
{{- end -}}
{{- end -}}
