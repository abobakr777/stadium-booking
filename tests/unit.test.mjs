import test from "node:test";
import assert from "node:assert/strict";
import { generateTeams } from "../src/utils/teams.js";
import { settings, profile } from "../functions/validation.js";
test("teams preserve input, stable IDs, balanced sizes, goalkeeper distribution", () => {
  const players = Array.from({ length: 13 }, (_, i) => ({
    name: `P${i}`,
    sequence: i,
    position: i < 3 ? "حارس" : ["دفاع", "وسط", "هجوم"][i % 3],
    level: ["مبتدئ", "متوسط", "محترف"][i % 3],
  }));
  const original = JSON.stringify(players);
  const { teams, text } = generateTeams(players, 3);
  assert.equal(JSON.stringify(players), original);
  assert.deepEqual(
    teams.map((t) => t.id),
    [1, 2, 3],
  );
  assert.equal(new Set(teams.flatMap((t) => t.players)).size, 13);
  assert.ok(
    Math.max(...teams.map((t) => t.players.length)) -
      Math.min(...teams.map((t) => t.players.length)) <=
      1,
  );
  assert.ok(teams.every((t) => t.positions["حارس"] === 1));
  assert.match(text, /الفريق 1/);
});
test("zero keepers warns and invalid team counts fail", () => {
  const p = [
    { name: "a", position: "وسط", level: "متوسط", sequence: 1 },
    { name: "b", position: "دفاع", level: "محترف", sequence: 2 },
  ];
  assert.match(generateTeams(p, 2).text, /عدد الحراس/);
  assert.throws(() => generateTeams(p, 3));
  assert.throws(() => generateTeams(p, 1));
});
test("exact schemas reject injected owner/paid flags and unsafe URLs", () => {
  const s = {
    title: "test",
    maxPlayers: 2,
    totalCost: 20,
    currency: "RM",
    location: "",
    startsAt: 200,
    endsAt: 300,
    withdrawalDeadline: 100,
  };
  assert.equal(settings(s).maxPlayers, 2);
  assert.throws(() => settings({ ...s, ownerUid: "attacker" }));
  assert.throws(() => settings({ ...s, location: "javascript:alert(1)" }));
  assert.throws(() => settings({ ...s, withdrawalDeadline: 400 }));
  assert.throws(() =>
    profile({ name: "x", position: "وسط", level: "محترف", isPaid: true }),
  );
});
