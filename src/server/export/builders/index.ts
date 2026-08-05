// Importing a builder module registers its descriptor(s) via registerExport()
// as a side effect. This file is the single place that wires every export
// kind into the registry — engine.ts and the router import only this.
import "./campers";
import "./campersMedical";
import "./idCards";
import "./attendanceSheet";
import "./reports";
import "./configBundle";
import "./staff";
import "./staffIdCards";

export {};
