import { InMemoryAuditSink } from "../../audit";
import { InMemoryGraphStore } from "../store/InMemoryGraphStore";
import { StoreBackedCMDBService } from "../service/impl/StoreBackedCMDBService";

export function createDevCMDB() {
  const audit = new InMemoryAuditSink();
  const store = new InMemoryGraphStore();
  const service = new StoreBackedCMDBService(store, audit);

  return { audit, store, service };
}
