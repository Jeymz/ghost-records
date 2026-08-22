import { DataTypes } from 'sequelize';

const JSON_COLUMN = DataTypes.JSON;

export function defineHistoricalEvidenceModels(sequelize) {
  const resolutionSnapshot = sequelize.define(
    'ResolutionSnapshot',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      scope: { type: DataTypes.STRING(255), allowNull: false },
      declaredTarget: { type: DataTypes.STRING(253), allowNull: false },
      terminalName: { type: DataTypes.STRING(253), allowNull: false },
      chain: { type: JSON_COLUMN, allowNull: false },
      terminalAnswers: { type: JSON_COLUMN, allowNull: false },
      rcode: { type: DataTypes.STRING(32), allowNull: false },
      coverage: { type: JSON_COLUMN, allowNull: false },
      queryCount: { type: DataTypes.INTEGER, allowNull: false },
      resolverLimits: { type: JSON_COLUMN, allowNull: false },
      evidenceHash: { type: DataTypes.STRING(64), allowNull: false },
      observedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'ghost_records_resolution_snapshots',
      timestamps: false,
      indexes: [
        { fields: ['scope', 'declaredTarget', 'observedAt'] },
        { fields: ['observedAt'] },
      ],
    },
  );

  const registrationObservation = sequelize.define(
    'RegistrationObservation',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      domain: { type: DataTypes.STRING(253), allowNull: false },
      handle: { type: DataTypes.STRING(255), allowNull: true },
      sourceRoot: { type: DataTypes.STRING(2048), allowNull: false },
      registrarHandle: { type: DataTypes.STRING(255), allowNull: true },
      statuses: { type: JSON_COLUMN, allowNull: false },
      events: { type: JSON_COLUMN, allowNull: false },
      nameservers: { type: JSON_COLUMN, allowNull: false },
      responseHash: { type: DataTypes.STRING(64), allowNull: false },
      coverageStatus: { type: DataTypes.STRING(32), allowNull: false },
      coverageReason: { type: DataTypes.STRING(64), allowNull: true },
      observedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'ghost_records_registration_observations',
      timestamps: false,
      indexes: [
        { fields: ['domain', 'observedAt'] },
        { fields: ['observedAt'] },
      ],
    },
  );

  const policyDecision = sequelize.define(
    'PolicyDecision',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      policyId: { type: DataTypes.STRING(128), allowNull: true },
      scope: { type: DataTypes.STRING(255), allowNull: false },
      target: { type: DataTypes.STRING(253), allowNull: false },
      decision: { type: DataTypes.STRING(32), allowNull: false },
      owner: { type: DataTypes.STRING(255), allowNull: true },
      reason: { type: DataTypes.STRING(2048), allowNull: true },
      expiresAt: { type: DataTypes.DATE, allowNull: true },
      evaluatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'ghost_records_policy_decisions',
      timestamps: false,
      indexes: [
        { fields: ['scope', 'target', 'evaluatedAt'] },
        { fields: ['evaluatedAt'] },
      ],
    },
  );

  const findingHistory = sequelize.define(
    'FindingHistory',
    {
      id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
      findingKey: { type: DataTypes.STRING(255), allowNull: false },
      status: { type: DataTypes.STRING(32), allowNull: false },
      severity: { type: DataTypes.STRING(32), allowNull: false },
      evidenceRefs: { type: JSON_COLUMN, allowNull: false },
      firstSeenAt: { type: DataTypes.DATE, allowNull: false },
      lastSeenAt: { type: DataTypes.DATE, allowNull: false },
      recordedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'ghost_records_finding_history',
      timestamps: false,
      indexes: [
        { fields: ['findingKey', 'recordedAt'] },
        { fields: ['recordedAt'] },
      ],
    },
  );

  const retentionMetadata = sequelize.define(
    'RetentionMetadata',
    {
      resourceType: { type: DataTypes.STRING(64), primaryKey: true },
      purgedThrough: { type: DataTypes.DATE, allowNull: true },
      lastRunAt: { type: DataTypes.DATE, allowNull: true },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'ghost_records_retention_metadata',
      timestamps: false,
    },
  );

  const retentionLease = sequelize.define(
    'RetentionLease',
    {
      leaseName: { type: DataTypes.STRING(128), primaryKey: true },
      leaseOwner: { type: DataTypes.STRING(255), allowNull: false },
      leaseExpiresAt: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'ghost_records_retention_leases',
      timestamps: false,
    },
  );

  return Object.freeze({
    resolutionSnapshot,
    registrationObservation,
    policyDecision,
    findingHistory,
    retentionMetadata,
    retentionLease,
  });
}
