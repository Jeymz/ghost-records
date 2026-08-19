import { afterEach, describe, expect, it } from 'vitest';

import { loadConfiguration } from '../../config/load-configuration.js';
import { createPersistenceLayer } from '../../persistence/index.js';

const integrationEnabled = process.env.GHOST_RECORDS_MYSQL_INTEGRATION === 'true';
const describeIntegration = integrationEnabled ? describe : describe.skip;
const integrationActorId =
  process.env.GHOST_RECORDS_MIGRATION_ACTOR_ID ?? 'ghost-records-integration-test';

let persistence;

afterEach(async () => {
  if (persistence) {
    await persistence.close();
    persistence = undefined;
  }
});

describeIntegration('owner-provided MySQL/PXC integration', () => {
  it('authenticates and runs the empty migration baseline repeatably', async () => {
    const configuration = loadConfiguration();
    persistence = createPersistenceLayer(configuration);

    await expect(persistence.checkReadiness()).resolves.toEqual({ ready: true });
    await expect(
      persistence.runMigrations({ actorId: integrationActorId }),
    ).resolves.toEqual({ appliedMigrationIds: [] });
    await expect(
      persistence.runMigrations({ actorId: integrationActorId }),
    ).resolves.toEqual({ appliedMigrationIds: [] });
  });
});
