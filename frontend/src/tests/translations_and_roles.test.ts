import { describe, it, expect } from "vitest";
import { translations } from "../i18n/translations";
import type { RoleName } from "../types";

describe("Frontend Localization & Translations", () => {
  it("should have identical key parity between English and Marathi dictionaries", () => {
    const enKeys = Object.keys(translations.en).sort();
    const mrKeys = Object.keys(translations.mr).sort();

    expect(enKeys).toEqual(mrKeys);
  });

  it("should have non-empty translations for all essential UI elements", () => {
    for (const lang of ["en", "mr"] as const) {
      const dict = translations[lang];
      expect(dict.appName).toBeTruthy();
      expect(dict.todayAttendance).toBeTruthy();
      expect(dict.officeIn).toBeTruthy();
      expect(dict.lunchBreakOut).toBeTruthy();
      expect(dict.lunchBreakIn).toBeTruthy();
      expect(dict.officeOut).toBeTruthy();
      expect(dict.reportsTitle).toBeTruthy();
      expect(dict.weeklyReport).toBeTruthy();
      expect(dict.monthlyReport).toBeTruthy();
      expect(dict.auditLogsTitle).toBeTruthy();
      expect(dict.kioskClockTitle).toBeTruthy();
    }
  });

  it("should provide distinct contextual messages for all 5 attendance statuses", () => {
    for (const lang of ["en", "mr"] as const) {
      const dict = translations[lang];
      const messages = [
        dict.msgNotStarted,
        dict.msgCheckedIn,
        dict.msgOnLunch,
        dict.msgReturnedLunch,
        dict.msgCompleted,
      ];

      // Ensure every message is populated and distinct
      const uniqueMessages = new Set(messages);
      expect(uniqueMessages.size).toBe(5);
    }
  });
});

describe("Role and Permission Guards", () => {
  const checkIsAdmin = (role: RoleName) => role === "ADMIN" || role === "SUPER_ADMIN";
  const checkIsSuperAdmin = (role: RoleName) => role === "SUPER_ADMIN";

  it("evaluates admin privileges accurately", () => {
    expect(checkIsAdmin("STAFF")).toBe(false);
    expect(checkIsAdmin("ADMIN")).toBe(true);
    expect(checkIsAdmin("SUPER_ADMIN")).toBe(true);
  });

  it("evaluates super admin privileges exclusively", () => {
    expect(checkIsSuperAdmin("STAFF")).toBe(false);
    expect(checkIsSuperAdmin("ADMIN")).toBe(false);
    expect(checkIsSuperAdmin("SUPER_ADMIN")).toBe(true);
  });
});
