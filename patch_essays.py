import re

with open('client/src/pages/QuestionSession.tsx', 'r') as f:
    content = f.read()

start_marker = "              {/* Grade breakdown */}"
end_marker = "              {/* Transcription */}"

# Find the indexes
start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

# Find the end of the transcription block
end_idx = content.find("</div>", end_idx + 100)
end_idx = content.find("</div>", end_idx + 6) + 7

replacement = """              {/* Tab Navigation */}
              {selectedEssay.correction && (
                <>
                  <div className="flex border-b border-white/10 overflow-x-auto no-scrollbar mb-4">
                    {[
                      { id: "nota", icon: Star, label: "Resultado Estimado" },
                      { id: "desvios", icon: AlertTriangle, label: "Inadequações", badge: (selectedEssay.correction.desvios || selectedEssay.correction.errors)?.length },
                      { id: "comentarios", icon: MessageSquare, label: "Parecer Técnico" },
                      { id: "estat", icon: BarChart2, label: "Métricas Textuais" },
                      { id: "texto", icon: FileText, label: "Raio-X do Texto" }
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => setActiveEssayTab(t.id as any)}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 min-w-[120px] text-[10px] font-black uppercase tracking-widest transition-colors border-b-2 ${activeEssayTab === t.id ? 'border-[var(--primary)] text-white bg-white/5' : 'border-transparent opacity-50 hover:opacity-100'}`}
                      >
                        <t.icon className="w-3.5 h-3.5" />
                        {t.label}
                        {t.badge ? <span className="bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[8px] ml-1">{t.badge}</span> : null}
                      </button>
                    ))}
                  </div>

                  <div className="space-y-6">
                    {activeEssayTab === "nota" && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {selectedEssay.correction.gradeBreakdown && (
                          <div className="space-y-4">
                            <p className="text-sm font-black uppercase tracking-widest opacity-50">📊 Notas por Critério</p>
                            {(() => {
                              const entries = Object.entries(selectedEssay.correction.gradeBreakdown);
                              const total = entries.reduce((s, [, v]) => s + Number(v), 0);
                              const max = total <= 12 ? 2 : 10;
                              return entries.map(([key, val]: [any, any]) => {
                                const pct = Math.min(100, Math.round((Number(val) / max) * 100));
                                const barColor = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-500';
                                const just = (selectedEssay.correction as any).gradeJustification?.[key];
                                return (
                                  <div key={key} className="space-y-1.5">
                                    <div className="flex justify-between items-baseline">
                                      <span className="text-base font-semibold">{key}</span>
                                      <span className="text-base font-black tabular-nums">{val}<span className="text-sm opacity-30">/{max}</span></span>
                                    </div>
                                    <div className="h-3 w-full rounded-full bg-white/10"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} /></div>
                                    {just && <p className="text-sm opacity-50 leading-relaxed">{just}</p>}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {selectedEssay.correction.strengths?.length > 0 && (
                            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5 space-y-3">
                              <p className="text-sm font-black uppercase text-green-400 tracking-widest">✅ Pontos Positivos</p>
                              {selectedEssay.correction.strengths.map((s: string, i: number) => (
                                <div key={i} className="flex gap-3 text-sm leading-relaxed"><span className="text-green-400 shrink-0 mt-0.5 text-base">▸</span><span className="opacity-80">{s}</span></div>
                              ))}
                            </div>
                          )}
                          {selectedEssay.correction.improvementPlan?.length > 0 && (
                            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-3">
                              <p className="text-sm font-black uppercase text-blue-400 tracking-widest">🎯 Plano de Melhoria</p>
                              {selectedEssay.correction.improvementPlan.map((s: string, i: number) => (
                                <div key={i} className="flex gap-3 text-sm leading-relaxed">
                                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-500/30 text-blue-400 flex items-center justify-center text-xs font-black mt-0.5">{i+1}</span>
                                  <span className="opacity-80">{s}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {activeEssayTab === "desvios" && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {!(selectedEssay.correction.desvios || selectedEssay.correction.errors)?.length ? (
                          <div className="py-10 text-center opacity-50 flex flex-col items-center">
                            <Target className="w-8 h-8 mb-2" />
                            <p className="text-sm font-bold">Nenhuma inadequação estrutural ou gramatical detectada!</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {(selectedEssay.correction.desvios || selectedEssay.correction.errors).map((err: any, i: number) => (
                              <div key={i} className="soe-card p-5 border-l-4" style={{ borderLeftColor: "var(--accent-red)", background: "var(--card-bg)" }}>
                                <div className="flex items-center gap-2 mb-3">
                                  <div className="w-2 h-2 rounded-full bg-red-500" />
                                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--muted-text)" }}>{err.type || err.tipo}</span>
                                </div>
                                <p className="text-xs font-medium mb-4 opacity-90 leading-relaxed" style={{ color: "var(--app-fg)" }}>{err.description || err.explicacao}</p>
                                <div className="flex flex-col sm:flex-row items-stretch gap-3">
                                  {err.trecho_original && (
                                    <>
                                      <div className="flex-1 w-full bg-rose-500/10 text-rose-500 px-4 py-3 rounded-2xl text-xs font-medium border border-rose-500/20 line-through decoration-rose-500/50 flex items-center justify-center text-center">
                                        {err.trecho_original}
                                      </div>
                                      <div className="hidden sm:flex items-center justify-center opacity-30">
                                        <span className="text-xl font-black">→</span>
                                      </div>
                                    </>
                                  )}
                                  {(err.suggestion || err.sugestao) && (
                                    <div className="flex-1 w-full bg-emerald-500/10 text-emerald-500 px-4 py-3 rounded-2xl text-xs font-bold border border-emerald-500/20 flex items-center justify-center gap-2 text-center shadow-lg shadow-emerald-500/5">
                                      <CheckCircle2 className="w-4 h-4 shrink-0" /> {err.suggestion || err.sugestao}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {activeEssayTab === "comentarios" && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {selectedEssay.correction.feedback && (
                          <div className="space-y-4">
                            <div className="space-y-3">{renderFeedback(selectedEssay.correction.feedback)}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {activeEssayTab === "estat" && (
                      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {!selectedEssay.correction.estatisticas ? (
                          <div className="py-10 text-center opacity-50 flex flex-col items-center">
                            <BarChart2 className="w-8 h-8 mb-2" />
                            <p className="text-sm font-bold">Métricas detalhadas indisponíveis nesta correção. Reavalie para gerar.</p>
                          </div>
                        ) : (
                          <>
                            <section className="space-y-3">
                              <h4 className="text-[10px] font-black uppercase tracking-widest opacity-50">Métricas Gerais</h4>
                              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                {[
                                  { label: "Caracteres", value: selectedEssay.correction.estatisticas.caracteres },
                                  { label: "Palavras", value: selectedEssay.correction.estatisticas.palavras },
                                  { label: "Frases", value: selectedEssay.correction.estatisticas.frases },
                                  { label: "Parágrafos", value: selectedEssay.correction.estatisticas.paragrafos },
                                  { label: "Conectivos", value: selectedEssay.correction.estatisticas.conectivos }
                                ].map((s, i) => (
                                  <div key={i} className="soe-card p-4 flex flex-col items-center justify-center gap-1 bg-white/[0.02]">
                                    <span className="text-2xl font-black tabular-nums">{s.value}</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40 text-center">{s.label}</span>
                                  </div>
                                ))}
                              </div>
                            </section>
                            <section className="space-y-3">
                              <h4 className="text-[10px] font-black uppercase tracking-widest opacity-50">Legibilidade</h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="soe-card p-5 flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold opacity-60">Tempo de Leitura</span>
                                  <div className="flex items-center gap-1.5 font-black text-lg text-blue-400">
                                    <Clock className="w-4 h-4" /> {selectedEssay.correction.estatisticas.tempoLeitura}
                                  </div>
                                </div>
                                <div className="soe-card p-5 flex items-center justify-between gap-2">
                                  <span className="text-xs font-bold opacity-60">Complexidade</span>
                                  <span className="font-black text-lg text-purple-400 uppercase tracking-wider">{selectedEssay.correction.estatisticas.nivelComplexidade}</span>
                                </div>
                              </div>
                            </section>
                          </>
                        )}
                      </div>
                    )}

                    {activeEssayTab === "texto" && (
                      <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="soe-card p-8 bg-[var(--app-bg)] shadow-inner">
                          <div className="text-sm font-medium leading-[2.5] whitespace-pre-wrap" style={{ color: "var(--app-fg)" }}>
                            <HighlightedText text={selectedEssay.transcription || "Sem transcrição."} desvios={selectedEssay.correction.desvios || selectedEssay.correction.errors} />
                          </div>
                        </div>
                        {(selectedEssay.correction.desvios || selectedEssay.correction.errors)?.length > 0 && (
                          <p className="text-[10px] font-bold text-center mt-4 opacity-50 uppercase tracking-widest flex items-center justify-center gap-2">
                            <AlertTriangle className="w-3 h-3 text-rose-500" />
                            Passe o mouse sobre os trechos sublinhados para ver as sugestões
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}"""

new_content = content[:start_idx] + replacement + content[end_idx:]

with open('client/src/pages/QuestionSession.tsx', 'w') as f:
    f.write(new_content)

print("Patched!")
