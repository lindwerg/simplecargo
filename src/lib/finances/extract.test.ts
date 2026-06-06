import { describe, expect, it } from "vitest";

import { extractAccounts, extractStatements, isStatementReady } from "./extract";

// Mirrors the live /accounts response (2026-06).
const accountsResponse = {
  Data: {
    Account: [
      {
        customerCode: "304927585",
        accountId: "40702810400000099904",
        status: "Enabled",
        currency: "RUB",
        accountType: "Business",
        accountDetails: [
          { schemeName: "RU.CBR.AccountNumber", identification: "40702810400000099904", name: "Счёт в банке Точка" },
        ],
      },
    ],
  },
  Meta: { totalPages: 1 },
};

// Mirrors the live statement response (2026-06).
const statementResponse = {
  Data: {
    Statement: [
      {
        accountId: "40702810400000099904",
        statementId: "800bc382-8579-4c71-82c9-b61f99838c69",
        status: "Ready",
        startDateTime: "2026-05-30",
        endDateTime: "2026-06-06",
        startDateBalance: 921563.77,
        endDateBalance: 918596.4,
        Transaction: [
          { transactionId: "1", creditDebitIndicator: "Debit", Amount: { amount: 50000, currency: "RUB" } },
          { transactionId: "2", creditDebitIndicator: "Credit", Amount: { amount: 112342.63, currency: "RUB" } },
        ],
      },
    ],
  },
};

describe("extractAccounts", () => {
  it("pulls accountId, currency and normalizes Enabled → active", () => {
    const accounts = extractAccounts(accountsResponse);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].externalAccountId).toBe("40702810400000099904");
    expect(accounts[0].currency).toBe("RUB");
    expect(accounts[0].status).toBe("active");
    expect(accounts[0].customerCode).toBe("304927585");
  });

  it("masks the account number and reads the title", () => {
    const [acc] = extractAccounts(accountsResponse);
    expect(acc.maskedNumber).toBe("4070…9904");
    expect(acc.title).toBe("Счёт в банке Точка");
  });

  it("returns [] for an empty/garbage envelope", () => {
    expect(extractAccounts({})).toEqual([]);
    expect(extractAccounts(null)).toEqual([]);
  });
});

describe("extractStatements", () => {
  it("flattens Data.Statement[] with balances and transactions", () => {
    const [st] = extractStatements(statementResponse);
    expect(st.statementId).toBe("800bc382-8579-4c71-82c9-b61f99838c69");
    expect(st.status).toBe("Ready");
    expect(st.endDateBalance).toBe(918596.4);
    expect(st.endDateTime).toBe("2026-06-06");
    expect(st.transactions).toHaveLength(2);
  });

  it("tolerates a single (non-array) Statement object", () => {
    const single = { Data: { Statement: { statementId: "x", status: "Created", Transaction: [] } } };
    const list = extractStatements(single);
    expect(list).toHaveLength(1);
    expect(list[0].statementId).toBe("x");
  });
});

describe("isStatementReady", () => {
  it("is false while Created, true once Ready", () => {
    expect(isStatementReady("Created")).toBe(false);
    expect(isStatementReady("Ready")).toBe(true);
    expect(isStatementReady(null)).toBe(false);
  });
});
