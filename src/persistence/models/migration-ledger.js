import { DataTypes } from 'sequelize';

export const MIGRATION_LEDGER_TABLE = 'ghost_records_schema_migrations';

export function defineMigrationLedger(sequelize) {
  return sequelize.define(
    'MigrationLedger',
    {
      sequence: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      migrationId: {
        type: DataTypes.STRING(191),
        unique: true,
        allowNull: false,
        field: 'migration_id',
      },
      appliedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'applied_at',
      },
    },
    {
      tableName: MIGRATION_LEDGER_TABLE,
      timestamps: false,
      freezeTableName: true,
    },
  );
}
