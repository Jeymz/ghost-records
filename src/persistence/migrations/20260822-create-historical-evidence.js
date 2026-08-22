import { DataTypes } from 'sequelize';

const TABLES = Object.freeze([
  'ghost_records_retention_leases',
  'ghost_records_retention_metadata',
  'ghost_records_finding_history',
  'ghost_records_policy_decisions',
  'ghost_records_registration_observations',
  'ghost_records_resolution_snapshots',
]);

function timestampColumn() {
  return { type: DataTypes.DATE, allowNull: false };
}

export const createHistoricalEvidenceMigration = Object.freeze({
  id: '20260822-create-historical-evidence',
  async up({ queryInterface, transaction }) {
    await queryInterface.createTable(
      'ghost_records_resolution_snapshots',
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        scope: { type: DataTypes.STRING(255), allowNull: false },
        declaredTarget: { type: DataTypes.STRING(253), allowNull: false },
        terminalName: { type: DataTypes.STRING(253), allowNull: false },
        chain: { type: DataTypes.JSON, allowNull: false },
        terminalAnswers: { type: DataTypes.JSON, allowNull: false },
        rcode: { type: DataTypes.STRING(32), allowNull: false },
        coverage: { type: DataTypes.JSON, allowNull: false },
        queryCount: { type: DataTypes.INTEGER, allowNull: false },
        resolverLimits: { type: DataTypes.JSON, allowNull: false },
        evidenceHash: { type: DataTypes.STRING(64), allowNull: false },
        observedAt: timestampColumn(),
      },
      { transaction },
    );
    await queryInterface.addIndex(
      'ghost_records_resolution_snapshots',
      ['scope', 'declaredTarget', 'observedAt'],
      { transaction },
    );

    await queryInterface.createTable(
      'ghost_records_registration_observations',
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        domain: { type: DataTypes.STRING(253), allowNull: false },
        handle: { type: DataTypes.STRING(255), allowNull: true },
        sourceRoot: { type: DataTypes.STRING(2048), allowNull: false },
        registrarHandle: { type: DataTypes.STRING(255), allowNull: true },
        statuses: { type: DataTypes.JSON, allowNull: false },
        events: { type: DataTypes.JSON, allowNull: false },
        nameservers: { type: DataTypes.JSON, allowNull: false },
        responseHash: { type: DataTypes.STRING(64), allowNull: false },
        coverageStatus: { type: DataTypes.STRING(32), allowNull: false },
        coverageReason: { type: DataTypes.STRING(64), allowNull: true },
        observedAt: timestampColumn(),
      },
      { transaction },
    );
    await queryInterface.addIndex(
      'ghost_records_registration_observations',
      ['domain', 'observedAt'],
      { transaction },
    );

    await queryInterface.createTable(
      'ghost_records_policy_decisions',
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        policyId: { type: DataTypes.STRING(128), allowNull: true },
        scope: { type: DataTypes.STRING(255), allowNull: false },
        target: { type: DataTypes.STRING(253), allowNull: false },
        decision: { type: DataTypes.STRING(32), allowNull: false },
        owner: { type: DataTypes.STRING(255), allowNull: true },
        reason: { type: DataTypes.STRING(2048), allowNull: true },
        expiresAt: { type: DataTypes.DATE, allowNull: true },
        evaluatedAt: timestampColumn(),
      },
      { transaction },
    );
    await queryInterface.addIndex(
      'ghost_records_policy_decisions',
      ['scope', 'target', 'evaluatedAt'],
      { transaction },
    );

    await queryInterface.createTable(
      'ghost_records_finding_history',
      {
        id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
        findingKey: { type: DataTypes.STRING(255), allowNull: false },
        status: { type: DataTypes.STRING(32), allowNull: false },
        severity: { type: DataTypes.STRING(32), allowNull: false },
        evidenceRefs: { type: DataTypes.JSON, allowNull: false },
        firstSeenAt: timestampColumn(),
        lastSeenAt: timestampColumn(),
        recordedAt: timestampColumn(),
      },
      { transaction },
    );
    await queryInterface.addIndex(
      'ghost_records_finding_history',
      ['findingKey', 'recordedAt'],
      { transaction },
    );

    await queryInterface.createTable(
      'ghost_records_retention_metadata',
      {
        resourceType: { type: DataTypes.STRING(64), primaryKey: true },
        purgedThrough: { type: DataTypes.DATE, allowNull: true },
        lastRunAt: { type: DataTypes.DATE, allowNull: true },
        updatedAt: timestampColumn(),
      },
      { transaction },
    );

    await queryInterface.createTable(
      'ghost_records_retention_leases',
      {
        leaseName: { type: DataTypes.STRING(128), primaryKey: true },
        leaseOwner: { type: DataTypes.STRING(255), allowNull: false },
        leaseExpiresAt: timestampColumn(),
      },
      { transaction },
    );
  },
  async down({ queryInterface, transaction }) {
    for (const tableName of TABLES) {
      await queryInterface.dropTable(tableName, { transaction });
    }
  },
});
