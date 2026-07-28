@@
   const [players, setPlayers] = useState<Player[]>([]);
   const [session, setSession] = useState<SwissSession | null>(null);
@@
   const handleStartSession = () => {
@@
-    const newSession: SwissSession = {
-      id: crypto.randomUUID(),
-      date: new Date().toISOString(),
-      config: { ...config },
-      players: [...players],
-      rounds: [],
-      currentRound: 0,
-      isCompleted: false,
-    };
+    const initializedPlayers = players.map(p => ({ ...p, hasHadBye: p.hasHadBye ?? false }));
+
+    const newSession: SwissSession = {
+      id: crypto.randomUUID(),
+      date: new Date().toISOString(),
+      config: { ...config },
+      players: initializedPlayers,
+      rounds: [],
+      currentRound: 0,
+      isCompleted: false,
+    };
@@
   function advanceToNextRound(s: SwissSession): SwissSession {
@@
-    if (s.config.refereeMode) {
-      const { pass1, pass2, byePlayerId } = generateRefereeRound(s.players, s.rounds, nextRoundNumber);
-      // Attach byePlayerId to first pass
-      if (byePlayerId) pass1.byePlayerId = byePlayerId;
-      newRounds = [...s.rounds, pass1, pass2];
-      setExpandedRounds([`${nextRoundNumber}-1`]);
-    } else {
-      const { matches, byePlayerId } = generateSwissRoundMatches(s.players, s.rounds, nextRoundNumber);
-      const round: SwissRound = {
-        roundNumber: nextRoundNumber,
-        phase: 'swiss',
-        matches,
-        isCompleted: false,
-        byePlayerId,
-      };
-      newRounds = [...s.rounds, round];
-      setExpandedRounds([`${nextRoundNumber}`]);
-    }
-
-    return { ...s, rounds: newRounds, currentRound: nextRoundNumber };
+    if (s.config.refereeMode) {
+      const { pass1, pass2, byePlayerId } = generateRefereeRound(s.players, s.rounds, nextRoundNumber);
+      // Attach byePlayerId to first pass
+      if (byePlayerId) pass1.byePlayerId = byePlayerId;
+      newRounds = [...s.rounds, pass1, pass2];
+      setExpandedRounds([`${nextRoundNumber}-1`]);
+
+      // mark bye on player
+      const updatedPlayers = byePlayerId
+        ? s.players.map(p => p.id === byePlayerId ? { ...p, hasHadBye: true } : p)
+        : s.players;
+      return { ...s, rounds: newRounds, currentRound: nextRoundNumber, players: updatedPlayers };
+    } else {
+      const { matches, byePlayerId } = generateSwissRoundMatches(s.players, s.rounds, nextRoundNumber);
+      const round: SwissRound = {
+        roundNumber: nextRoundNumber,
+        phase: 'swiss',
+        matches,
+        isCompleted: false,
+        byePlayerId,
+      };
+      newRounds = [...s.rounds, round];
+      setExpandedRounds([`${nextRoundNumber}`]);
+
+      const updatedPlayers = byePlayerId
+        ? s.players.map(p => p.id === byePlayerId ? { ...p, hasHadBye: true } : p)
+        : s.players;
+      return { ...s, rounds: newRounds, currentRound: nextRoundNumber, players: updatedPlayers };
+    }
   }
+
+  // Remove current round (only allowed if no matches completed in this round)
+  const handleRemoveCurrentRound = () => {
+    if (!session) return;
+    const cur = session.currentRound;
+    if (cur === 0) { toast.error('Keine Runde zum Entfernen'); return; }
+
+    const roundSegments = session.rounds.filter(r => r.roundNumber === cur);
+    const anyCompleted = roundSegments.some(seg => seg.matches.some(m => m.isCompleted));
+    if (anyCompleted) { toast.error('Runde enthält bereits Ergebnisse und kann nicht entfernt werden'); return; }
+
+    // confirm
+    if (!confirm(`Runde ${cur} wirklich entfernen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
+
+    const remaining = session.rounds.filter(r => r.roundNumber !== cur);
+    // rollback bye flags if needed
+    const byePlayers = roundSegments.map(r => r.byePlayerId).filter(Boolean) as string[];
+    let updatedPlayers = session.players;
+    if (byePlayers.length > 0) {
+      updatedPlayers = updatedPlayers.map(p => byePlayers.includes(p.id) ? { ...p, hasHadBye: false } : p);
+    }
+
+    setSession(prev => prev ? { ...prev, rounds: remaining, currentRound: Math.max(0, prev.currentRound - 1), players: updatedPlayers } : prev);
+    toast.success(`Runde ${cur} entfernt`);
+  };
@@
           {isAdmin && (
             <div className="flex gap-2">
@@
               <Button variant="outline" size="sm" onClick={handleResetSession}>
                 <RotateCcw className="w-4 h-4 mr-2" />
                 Zurücksetzen
               </Button>
+              {session.currentRound > 0 && (
+                <Button variant="destructive" size="sm" onClick={handleRemoveCurrentRound}>
+                  Runde entfernen
+                </Button>
+              )}
             </div>
           )}
         </div>
*** End Patch
