import Sqlite from "better-sqlite3";

// A sqlite-backed log suitable for concurrent use from multiple workers

const LOG_TABLE = "log";
const ROWID_COLUMN = "rowid";
const COST_COLUMN = "cost";
const DATA_COLUMN = "data";

// Autoincrement behavior is unlikely to be needed in practice since it
// would only matter if items other than the oldest were deleted, or all
// items were deleted, but include it for peace of mind
const SCHEMA = `
create table ${LOG_TABLE}(
  ${ROWID_COLUMN} integer primary key autoincrement,
  ${COST_COLUMN} integer,
  ${DATA_COLUMN} blob
);
`;

type LogItemProperties = {
  data: Uint8Array;
  cost: number;
};

type LogItem = LogItemProperties & {
  rowid: number;
};

interface PersistentLog {
  insert(items: ReadonlyArray<LogItemProperties>): void;
  all(): ReadonlyArray<LogItemProperties>;
  newerThan(rowid: number): ReadonlyArray<LogItemProperties>;
}

export class SqlitePersistentLog implements PersistentLog {
  private readonly db: Sqlite.Database;
  private readonly idAndCostStatement: Sqlite.Statement;
  private readonly deleteStatement: Sqlite.Statement;
  private readonly insertStatement: Sqlite.Statement;
  private readonly selectAllStatement: Sqlite.Statement;
  private readonly selectNewerThanStatement: Sqlite.Statement;
  constructor(path: string, private readonly maxCost: number) {
    this.db = new Sqlite(path);
    if (
      this.db
        .prepare(`select 1 from sqlite_schema where name = ?`)
        .all(LOG_TABLE).length == 0
    ) {
      this.db.exec(SCHEMA);
    }
    this.idAndCostStatement = this.db.prepare(
      `select ${ROWID_COLUMN}, ${COST_COLUMN} from ${LOG_TABLE} order by ${ROWID_COLUMN};`
    );
    this.deleteStatement = this.db.prepare(
      `delete from ${LOG_TABLE} where ${ROWID_COLUMN} = ?;`
    );
    this.insertStatement = this.db.prepare(
      `insert into ${LOG_TABLE} (${COST_COLUMN}, ${DATA_COLUMN}) values (?, ?);`
    );
    this.selectAllStatement = this.db.prepare(
      `select ${ROWID_COLUMN}, ${COST_COLUMN}, ${DATA_COLUMN} from ${LOG_TABLE} order by ${ROWID_COLUMN};`
    );
    this.selectNewerThanStatement = this.db.prepare(
      `select ${ROWID_COLUMN}, ${COST_COLUMN}, ${DATA_COLUMN} from ${LOG_TABLE} where ${ROWID_COLUMN} > ? order by ${ROWID_COLUMN};`
    );
  }
  insert(items: ReadonlyArray<LogItemProperties>): void {
    this.db
      .transaction(() => {
        // Load current items and expunge oldest items if needed to make room for new items
        const priorItems =
          this.idAndCostStatement.all() as ReadonlyArray<LogItem>;
        let databaseCost = priorItems.reduce(
          (reduction, next) => reduction + next.cost,
          0
        );
        const newItemsCost = items.reduce(
          (reduction, next) => reduction + next.cost,
          0
        );
        const maxCostBeforeNewItems = this.maxCost - newItemsCost;
        for (const priorItem of priorItems) {
          if (databaseCost <= maxCostBeforeNewItems) {
            break;
          }
          this.deleteStatement.run(priorItem.rowid);
          databaseCost -= priorItem.cost;
        }
        for (const item of items) {
          this.insertStatement.run(item.cost, item.data);
        }
      })
      .exclusive();
  }
  all(): ReadonlyArray<LogItem> {
    return this.selectAllStatement.all() as ReadonlyArray<LogItem>;
  }
  newerThan(rowid: number): ReadonlyArray<LogItem> {
    return this.selectNewerThanStatement.all(rowid) as ReadonlyArray<LogItem>;
  }
}
