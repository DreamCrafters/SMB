import { readServerConfig } from "./config/env.js";
import { runMigrations } from "./db/migrations.js";
import {
  createDatabasePool,
  createDatabaseSnapshotPool,
} from "./db/pool.js";
import {
  createDatabaseTransactionContext,
  runWithDatabaseMutationLock,
} from "./db/transactionContext.js";
import {
  createProductionDatabaseSnapshotService,
  testDatabaseMutationLockName,
} from "./db/productionSnapshot.js";
import { createApiServer } from "./http/app.js";
import { createAdminDatabaseRepository } from "./repositories/adminDatabaseRepository.js";
import { createAccountsRepository } from "./repositories/accountsRepository.js";
import { createAuthSessionService } from "./repositories/authRepository.js";
import { createDispatcherSubmissionsRepository } from "./repositories/dispatcherSubmissionsRepository.js";
import { createDispatcherSpreadsheetImportRepository } from "./repositories/dispatcherSpreadsheetImportRepository.js";
import { createAuditRepository } from "./repositories/auditRepository.js";
import { createProductionPlansRepository } from "./repositories/productionPlansRepository.js";
import { createProductBrandsRepository } from "./repositories/productBrandsRepository.js";
import { createRawMaterialNomenclatureRepository } from "./repositories/rawMaterialNomenclatureRepository.js";
import { createRefractoryReportsRepository } from "./repositories/refractoryReportsRepository.js";
import { createRefractoryWagonsRepository } from "./repositories/refractoryWagonsRepository.js";
import { createRefractoryWagonInspectionsRepository } from "./repositories/refractoryWagonInspectionsRepository.js";
import { createLaboratoryResultsRepository } from "./repositories/laboratoryResultsRepository.js";
import { createLaboratoryBankAssignmentsRepository } from "./repositories/laboratoryBankAssignmentsRepository.js";
import { createRotaryKiln2FiringJournalRepository } from "./repositories/rotaryKiln2FiringJournalRepository.js";
import { createLaboratorySampleRegistrationJournalRepository } from "./repositories/laboratorySampleRegistrationJournalRepository.js";
import { createLaboratoryChemicalAnalysisJournalRepository } from "./repositories/laboratoryChemicalAnalysisJournalRepository.js";
import { createLaboratoryUnshapedProductSampleJournalRepository } from "./repositories/laboratoryUnshapedProductSampleJournalRepository.js";
import { createLaboratoryFormedProductSampleJournalRepository } from "./repositories/laboratoryFormedProductSampleJournalRepository.js";
import { createLaboratoryVerificationJournalRepository } from "./repositories/laboratoryVerificationJournalRepository.js";
import { createLaboratoryRawMaterialQualityJournalRepository } from "./repositories/laboratoryRawMaterialQualityJournalRepository.js";
import { createLaboratoryRawMaterialWarehouseRepository } from "./repositories/laboratoryRawMaterialWarehouseRepository.js";
import { createLaboratoryGreenProductQualityJournalRepository } from "./repositories/laboratoryGreenProductQualityJournalRepository.js";
import { createBoardAssignmentsRepository } from "./repositories/boardAssignmentsRepository.js";
import { createWarehouse1cRepository } from "./repositories/warehouse1cRepository.js";
import { createNotificationSettingsRepository } from "./repositories/notificationSettingsRepository.js";
import { createNavigationOrderRepository } from "./repositories/navigationOrderRepository.js";
import { createDispatcherSpreadsheetImportService } from "./integrations/dispatcherSpreadsheetImport.js";

const config = readServerConfig();
const applicationPool = createDatabasePool(config.databaseUrl);
const productionPool = config.productionSnapshot.enabled
  ? createDatabaseSnapshotPool(config.productionSnapshot.sourceDatabaseUrl)
  : undefined;
const testSnapshotPool = config.productionSnapshot.enabled
  ? createDatabaseSnapshotPool(config.databaseUrl)
  : undefined;
const productionSnapshot = productionPool === undefined
  ? undefined
  : createProductionDatabaseSnapshotService({
      sourcePool: productionPool,
      targetPool: testSnapshotPool!,
    });
const database = createDatabaseTransactionContext(
  applicationPool,
  config.productionSnapshot.enabled
    ? { mutationLockName: testDatabaseMutationLockName }
    : {},
);
const pool = database.pool;
const dispatcherSpreadsheetImportRepository =
  createDispatcherSpreadsheetImportRepository(pool);
const productBrands = createProductBrandsRepository(pool, {
  referenceLockPool: applicationPool,
});
const refractoryReports = createRefractoryReportsRepository(pool, {
  readProductBrandMergeAliases: () => productBrands.listMergeAliases(),
});
const refractoryWagons = createRefractoryWagonsRepository(pool);
const laboratorySampleRegistrationJournal =
  createLaboratorySampleRegistrationJournalRepository(pool);
const claimSampleRegistrationTransmission =
  laboratorySampleRegistrationJournal.claimTransmission;

if (config.runMigrationsOnStart) {
  if (config.productionSnapshot.enabled) {
    await runWithDatabaseMutationLock({
      pool: applicationPool,
      lockName: testDatabaseMutationLockName,
      operation: () => runMigrations(applicationPool),
    });
  } else {
    await runMigrations(pool);
  }
}

const server = createApiServer({
  config,
  adminDatabase: createAdminDatabaseRepository(pool),
  accounts: createAccountsRepository(pool),
  authService: createAuthSessionService(pool, {
    sessionTtlHours: config.session.ttlHours,
  }),
  dispatcherSubmissions: createDispatcherSubmissionsRepository(pool),
  productionPlans: createProductionPlansRepository(pool),
  productionBrands: productBrands,
  productBrandJournal: productBrands,
  rawMaterialNomenclature: createRawMaterialNomenclatureRepository(pool),
  refractoryReports,
  refractoryWagons,
  refractoryWagonInspections: createRefractoryWagonInspectionsRepository(pool),
  laboratoryResults: createLaboratoryResultsRepository(pool),
  laboratoryBankAssignments: createLaboratoryBankAssignmentsRepository(pool),
  rotaryKiln2FiringJournal:
    createRotaryKiln2FiringJournalRepository(pool),
  laboratorySampleRegistrationJournal,
  laboratoryChemicalAnalysisJournal:
    createLaboratoryChemicalAnalysisJournalRepository(pool),
  laboratoryUnshapedProductSampleJournal:
    createLaboratoryUnshapedProductSampleJournalRepository(pool, {
      claimSampleRegistrationTransmission,
    }),
  laboratoryFormedProductSampleJournal:
    createLaboratoryFormedProductSampleJournalRepository(pool, {
      refractoryWagons,
      claimSampleRegistrationTransmission,
    }),
  laboratoryVerificationJournal:
    createLaboratoryVerificationJournalRepository(pool, {
      claimSampleRegistrationTransmission,
    }),
  laboratoryRawMaterialQualityJournal:
    createLaboratoryRawMaterialQualityJournalRepository(pool),
  laboratoryRawMaterialWarehouse:
    createLaboratoryRawMaterialWarehouseRepository(pool),
  laboratoryGreenProductQualityJournal:
    createLaboratoryGreenProductQualityJournalRepository(pool),
  boardAssignments: createBoardAssignmentsRepository(pool),
  warehouse1c: createWarehouse1cRepository(pool),
  notificationSettings: createNotificationSettingsRepository(pool),
  navigationOrder: createNavigationOrderRepository(pool),
  audit: createAuditRepository(pool),
  databaseTransaction: database.transaction,
  productionSnapshot,
  dispatcherSpreadsheetImport: createDispatcherSpreadsheetImportService(
    config.googleSheetsReference,
    dispatcherSpreadsheetImportRepository,
  ),
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`SMB Monitor API listening on http://127.0.0.1:${config.port}`);
});

async function shutdown() {
  server.close(() => {
    void Promise.all([
      applicationPool.end(),
      productionPool?.end() ?? Promise.resolve(),
      testSnapshotPool?.end() ?? Promise.resolve(),
    ]).then(() => {
        process.exit(0);
      });
  });
}

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
