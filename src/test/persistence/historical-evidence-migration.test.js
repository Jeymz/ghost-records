import { describe, expect, it, vi } from 'vitest';
import { createHistoricalEvidenceMigration } from '../../persistence/migrations/20260822-create-historical-evidence.js';
import { migrations } from '../../persistence/migrations/manifest.js';

describe('createHistoricalEvidenceMigration', () => {
  it('is registered in the immutable manifest and creates normalized evidence/retention tables only', async () => {
    const queryInterface = {
      createTable: vi.fn().mockResolvedValue(undefined),
      addIndex: vi.fn().mockResolvedValue(undefined),
      dropTable: vi.fn().mockResolvedValue(undefined),
    };
    const transaction = {};

    await createHistoricalEvidenceMigration.up({ queryInterface, transaction });

    expect(migrations).toContain(createHistoricalEvidenceMigration);
    expect(queryInterface.createTable.mock.calls.map(([name]) => name)).toEqual([
      'ghost_records_resolution_snapshots',
      'ghost_records_registration_observations',
      'ghost_records_policy_decisions',
      'ghost_records_finding_history',
      'ghost_records_retention_metadata',
      'ghost_records_retention_leases',
    ]);
    expect(queryInterface.createTable.mock.calls.map(([name]) => name)).not.toContain(
      'ghost_records_raw_rdap_evidence',
    );
    expect(queryInterface.addIndex).toHaveBeenCalledTimes(4);

    await createHistoricalEvidenceMigration.down({ queryInterface, transaction });
    expect(queryInterface.dropTable.mock.calls.map(([name]) => name)).toEqual([
      'ghost_records_retention_leases',
      'ghost_records_retention_metadata',
      'ghost_records_finding_history',
      'ghost_records_policy_decisions',
      'ghost_records_registration_observations',
      'ghost_records_resolution_snapshots',
    ]);
  });
});
