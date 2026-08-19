import { DataTypes } from 'sequelize';

export const MIGRATION_LEASE_TABLE = 'ghost_records_migration_leases';
export const MIGRATION_LEASE_NAME = 'schema-migrations';

export function defineMigrationLease(sequelize) {
  return sequelize.define(
    'MigrationLease',
    {
      lockName: {
        type: DataTypes.STRING(191),
        primaryKey: true,
        allowNull: false,
        field: 'lock_name',
      },
      leaseOwner: {
        type: DataTypes.STRING(191),
        allowNull: false,
        field: 'lease_owner',
      },
      leaseExpiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'lease_expires_at',
      },
    },
    {
      tableName: MIGRATION_LEASE_TABLE,
      timestamps: false,
      freezeTableName: true,
    },
  );
}
