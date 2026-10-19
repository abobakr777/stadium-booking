const points = (p) => ({ مبتدئ: 1, متوسط: 2, محترف: 3 })[p.level] || 1;
export function generateTeams(players, count) {
  if (!Number.isInteger(count) || count < 2 || count > players.length)
    throw Error("عدد اللاعبين غير كافٍ للفرق");
  const teams = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    players: [],
    score: 0,
    positions: {},
  }));
  const positions = ["حارس", "دفاع", "وسط", "هجوم"];
  const sorted = [...players].sort(
    (a, b) =>
      positions.indexOf(a.position) - positions.indexOf(b.position) ||
      points(b) - points(a) ||
      a.sequence - b.sequence,
  );
  for (const p of sorted) {
    const min = Math.min(...teams.map((t) => t.players.length));
    const team = teams
      .filter((t) => t.players.length === min)
      .sort(
        (a, b) =>
          (a.positions[p.position] || 0) - (b.positions[p.position] || 0) ||
          a.score - b.score ||
          a.id - b.id,
      )[0];
    team.players.push(p);
    team.score += points(p);
    team.positions[p.position] = (team.positions[p.position] || 0) + 1;
  }
  const warning =
    players.filter((p) => p.position === "حارس").length < count
      ? "⚠️ عدد الحراس أقل من عدد الفرق\n"
      : "";
  return {
    teams,
    text:
      warning +
      teams
        .map(
          (t) =>
            `🏆 الفريق ${t.id} (القوة: ${t.score})\n` +
            t.players
              .map((p) => `- ${p.name} | ${p.position} | ${p.level}`)
              .join("\n"),
        )
        .join("\n\n"),
  };
}
