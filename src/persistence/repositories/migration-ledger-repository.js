export function createMigrationLedgerRepository(migrationLedger) {
  return Object.freeze({
    async listAppliedMigrationIds() {
      const migrations = await migrationLedger.findAll({
        attributes: ['migrationId'],
      });

      return new Set(migrations.map((migration) => migration.migrationId));
    },

    async recordAppliedMigration({ migrationId, transaction, appliedAt = new Date() }) {
      await migrationLedger.create(
        {
          migrationId,
          appliedAt,
        },
        { transaction },
      );
    },

    async findMostRecentAppliedMigration() {
      return migrationLedger.findOne({
        order: [['sequence', 'DESC']],
      });
    },

    async removeAppliedMigration({ migrationId, transaction }) {
      await migrationLedger.destroy({
        where: { migrationId },
        transaction,
      });
    },
  });
}
