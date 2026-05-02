const SELETIVO_OPERATIONAL = Object.freeze({
  moduleName: 'SELETIVO',
  flows: Object.freeze({
    GERAL: 'GERAL',
    VERIFICACAO_INSCRICAO: 'VERIFICACAO_INSCRICAO',
    AGENDAMENTO_INBOX: 'AGENDAMENTO_INBOX',
    REMARCACAO: 'REMARCACAO',
    PRESENCA_ENTREVISTADOR: 'PRESENCA_ENTREVISTADOR',
    POS_ENTREVISTA: 'POS_ENTREVISTA',
    REFRESH_VISUALIZACAO: 'REFRESH_VISUALIZACAO'
  }),
  capabilities: Object.freeze({
    TRIGGER: 'TRIGGER',
    EMAIL: 'EMAIL',
    INBOX: 'INBOX',
    SYNC: 'SYNC'
  })
});

function seletivo_getExecutionTypeFromEvent_(e) {
  if (e && (e.triggerUid || e.authMode || e.range)) {
    return 'TRIGGER';
  }
  return 'MANUAL';
}

function seletivo_getFlowConfig_(flowName) {
  return GEAPA_CORE.coreGetModuleConfig(SELETIVO_OPERATIONAL.moduleName, flowName, {});
}

function seletivo_buildStatusObs_(opts) {
  const parts = [];
  const source = String((opts && opts.source) || '').trim();
  if (source) parts.push('source=' + source);

  const executionType = String((opts && opts.executionType) || '').trim();
  if (executionType) parts.push('executionType=' + executionType);

  return parts.join(' | ');
}

function seletivo_mapBlockReasonCode_(config, executionType, capability) {
  if (!config) return 'CONFIG_AUSENTE';
  if (config.active === false) return 'ATIVO_NAO';
  if (config.mode === 'OFF') return 'MODO_OFF';
  if (config.mode === 'MANUAL' && executionType === 'TRIGGER') return 'MODO_MANUAL_TRIGGER';
  if (capability) return 'CAPABILITY_BLOQUEADA';
  return 'BLOQUEADO';
}

function seletivo_beginOperationalFlow_(flowName, capability, opts) {
  opts = opts || {};

  const executionType = String(opts.executionType || 'MANUAL').trim().toUpperCase();
  let flowConfig = null;
  let modeRead = '';
  const obs = seletivo_buildStatusObs_(opts);

  try {
    flowConfig = seletivo_getFlowConfig_(flowName);
    modeRead = String((flowConfig && flowConfig.mode) || '').trim().toUpperCase();

    const decision = GEAPA_CORE.coreAssertModuleExecutionAllowed(
      SELETIVO_OPERATIONAL.moduleName,
      flowName,
      capability,
      { executionType: executionType }
    );

    GEAPA_CORE.coreModuleStatusMarkExecution(
      SELETIVO_OPERATIONAL.moduleName,
      flowName,
      capability,
      { modeRead: modeRead, obs: obs }
    );

    return Object.freeze({
      allowed: true,
      blocked: false,
      flowName: flowName,
      capability: capability,
      executionType: executionType,
      dryRun: !!decision.dryRun,
      modeRead: modeRead,
      config: decision.config || flowConfig
    });
  } catch (err) {
    const reasonCode = seletivo_mapBlockReasonCode_(flowConfig, executionType, capability);
    const reasonMessage = String(err && err.message ? err.message : 'Fluxo bloqueado por MODULOS_CONFIG.');

    GEAPA_CORE.coreModuleStatusMarkBlocked(
      SELETIVO_OPERATIONAL.moduleName,
      flowName,
      reasonCode,
      reasonMessage,
      capability,
      modeRead,
      { obs: obs }
    );

    Logger.log(
      'seletivo_beginOperationalFlow_: fluxo bloqueado | fluxo=' + flowName +
      ' | capability=' + capability +
      ' | mode=' + modeRead +
      ' | motivo=' + reasonMessage
    );

    return Object.freeze({
      allowed: false,
      blocked: true,
      flowName: flowName,
      capability: capability,
      executionType: executionType,
      dryRun: modeRead === 'DRY_RUN',
      modeRead: modeRead,
      error: err,
      config: flowConfig
    });
  }
}

function seletivo_finishOperationalFlowSuccess_(runtime, opts) {
  if (!runtime || !runtime.allowed) return;

  GEAPA_CORE.coreModuleStatusMarkSuccess(
    SELETIVO_OPERATIONAL.moduleName,
    runtime.flowName,
    runtime.capability,
    {
      modeRead: runtime.modeRead,
      obs: seletivo_buildStatusObs_(opts || {})
    }
  );
}

function seletivo_finishOperationalFlowError_(runtime, err, opts) {
  if (!runtime || !runtime.allowed) return;

  GEAPA_CORE.coreModuleStatusMarkError(
    SELETIVO_OPERATIONAL.moduleName,
    runtime.flowName,
    err,
    runtime.capability,
    {
      modeRead: runtime.modeRead,
      obs: seletivo_buildStatusObs_(opts || {})
    }
  );
}

function seletivo_runOperationalFlow_(flowName, capability, opts, callback) {
  const runtime = seletivo_beginOperationalFlow_(flowName, capability, opts || {});
  if (!runtime.allowed) return runtime;

  try {
    const result = callback(runtime);
    seletivo_finishOperationalFlowSuccess_(runtime, opts || {});
    return result;
  } catch (err) {
    seletivo_finishOperationalFlowError_(runtime, err, opts || {});
    throw err;
  }
}

function seletivo_canApplyEffect_(runtime, capability, description) {
  if (!runtime || !runtime.allowed) return false;

  if (!GEAPA_CORE.coreCanModuleUseCapability(
    SELETIVO_OPERATIONAL.moduleName,
    runtime.flowName,
    capability,
    { executionType: runtime.executionType }
  )) {
    Logger.log(
      'seletivo_canApplyEffect_: capability bloqueada | fluxo=' + runtime.flowName +
      ' | capability=' + capability +
      ' | acao=' + description
    );
    return false;
  }

  if (runtime.dryRun) {
    Logger.log(
      'seletivo_canApplyEffect_: DRY_RUN suprimiu efeito real | fluxo=' + runtime.flowName +
      ' | capability=' + capability +
      ' | acao=' + description
    );
    return false;
  }

  return true;
}

function seletivo_runEffect_(runtime, capability, description, callback) {
  if (!seletivo_canApplyEffect_(runtime, capability, description)) return null;
  return callback();
}
