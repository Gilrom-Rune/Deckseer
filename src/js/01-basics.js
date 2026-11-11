"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const money = (n, cur) => ((cur || (typeof prefs !== "undefined" && prefs.cur)) === "eur" ? "€" : "$") + (Number(n) || 0).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Card geometry (fractions of the card) */
const CARD_RATIO = 63 / 88;
const NAME_ZONE = {x:0.045, y:0.035, w:0.70, h:0.07};
const INFO_ZONE = {x:0.03, y:0.885, w:0.46, h:0.085};

