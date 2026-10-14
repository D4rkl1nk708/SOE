for filepath in ['/home/anon/SOE/server/_core/index.ts', '/home/anon/SOE/server/_core/index.prod.ts']:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add import
    import_line = 'import { findBestDisciplineMatch, findBestTopicMatch, analyzeDisciplineOrTopicWithAI } from "../tecDisciplineMatcher";\n'
    if 'tecDisciplineMatcher' not in content:
        content = import_line + content

    # 2. Patch caderno-push
    old_caderno = """        // Match or create discipline
        let disc = disciplines.find((d) => isFuzzyMatch(d.name, discName));
        if (!disc) {
          const { id } = await storage.createDiscipline({
            userId: user.id,
            name: discName,
            color: "#6366f1",
            weight: 1,
          });
          disciplines = await storage.getDisciplinesByUser(user.id);
          disc = disciplines.find((d) => d.id === id)!;
        }

        // Match or create topic
        let topic = topics.find(
          (t) =>
            t.disciplineId === disc!.id && isFuzzyMatch(t.name, assuntoName),
        );"""

    new_caderno = """        // Match or create discipline with intelligence
        const userSettings = await storage.getUserSettings(user.id);
        const discMatch = findBestDisciplineMatch(
          disciplines,
          discName,
          assuntoName,
          userSettings?.tecDisciplineAliases,
          topics,
        );
        let disc = discMatch.discipline;

        if (!disc) {
          const aiAnalysis = await analyzeDisciplineOrTopicWithAI({
            incomingDiscipline: discName,
            incomingTopic: assuntoName,
            existingDisciplines: disciplines,
            existingTopics: topics,
            userSettings,
          });
          if (aiAnalysis.matchedDisciplineId) {
            disc = disciplines.find((d) => d.id === aiAnalysis.matchedDisciplineId) || null;
          }
        }

        if (!disc) {
          const { id } = await storage.createDiscipline({
            userId: user.id,
            name: discName,
            color: "#6366f1",
            weight: 1,
          });
          disciplines = await storage.getDisciplinesByUser(user.id);
          disc = disciplines.find((d) => d.id === id)!;
        }

        // Match or create topic with intelligence
        const topicMatch = findBestTopicMatch(topics, assuntoName, disc!.id);
        let topic = topicMatch.topic;"""
    assert old_caderno in content, f'old_caderno not found in {filepath}'
    content = content.replace(old_caderno, new_caderno)

    # 3. Patch increment
    old_increment = """        let disciplines = await storage.getDisciplinesByUser(user.id);
        let disc = disciplines.find((d) =>
          isFuzzyMatch(d.name, disciplinaName),
        );

        if (!disc) {
          const created = await storage.createDiscipline({
            userId: user.id,
            name: disciplinaName,
            color: "#6366f1",
            weight: 1,
          });
          disc = Object.assign({}, created, { id: created.id }) as any;
          disciplines = await storage.getDisciplinesByUser(user.id);
        }

        // Add time to discipline
        if (timeSpentSeconds && timeSpentSeconds > 0) {
          await storage.updateDiscipline(disc!.id, user.id, {
            studyTimeSeconds: (disc!.studyTimeSeconds || 0) + timeSpentSeconds,
          });
        }

        let topics = await storage.getTopicsByUser(user.id);
        let topic = topics.find(
          (t) =>
            t.disciplineId === disc!.id && isFuzzyMatch(t.name, assuntoName),
        );"""

    new_increment = """        let disciplines = await storage.getDisciplinesByUser(user.id);
        let topics = await storage.getTopicsByUser(user.id);
        const userSettings = await storage.getUserSettings(user.id);

        const discMatch = findBestDisciplineMatch(
          disciplines,
          disciplinaName,
          assuntoName,
          userSettings?.tecDisciplineAliases,
          topics,
        );
        let disc = discMatch.discipline;

        if (!disc) {
          const aiAnalysis = await analyzeDisciplineOrTopicWithAI({
            incomingDiscipline: disciplinaName,
            incomingTopic: assuntoName,
            existingDisciplines: disciplines,
            existingTopics: topics,
            userSettings,
          });
          if (aiAnalysis.matchedDisciplineId) {
            disc = disciplines.find((d) => d.id === aiAnalysis.matchedDisciplineId) || null;
          }
        }

        if (!disc) {
          const created = await storage.createDiscipline({
            userId: user.id,
            name: disciplinaName,
            color: "#6366f1",
            weight: 1,
          });
          disc = Object.assign({}, created, { id: created.id }) as any;
          disciplines = await storage.getDisciplinesByUser(user.id);
        }

        // Add time to discipline
        if (timeSpentSeconds && timeSpentSeconds > 0) {
          await storage.updateDiscipline(disc!.id, user.id, {
            studyTimeSeconds: (disc!.studyTimeSeconds || 0) + timeSpentSeconds,
          });
        }

        const topicMatch = findBestTopicMatch(topics, assuntoName, disc!.id);
        let topic = topicMatch.topic;"""
    assert old_increment in content, f'old_increment not found in {filepath}'
    content = content.replace(old_increment, new_increment)

    # 4. Patch wrong-question
    old_wrong = """        // Match or create discipline and topic based on the names provided by the extension
        if (disciplinaName) {
          let disc = disciplines.find((d) =>
            isFuzzyMatch(d.name, disciplinaName),
          );
          if (!disc) {
            const created = await storage.createDiscipline({
              userId: user.id,
              name: disciplinaName,
              color: "#e74c3c",
              weight: 1,
            });
            discId = created.id;
            disciplines = await storage.getDisciplinesByUser(user.id);
          } else {
            discId = disc.id;
          }

          if (assuntoName && discId) {
            let topics = await storage.getTopicsByUser(user.id);
            let topic = topics.find(
              (t) =>
                t.disciplineId === discId && isFuzzyMatch(t.name, assuntoName),
            );
            if (!topic) {
              const created = await storage.createTopic({
                userId: user.id,
                disciplineId: discId,
                name: assuntoName,
                studyDate: new Date().toISOString(),
                notes: null,
              });
              topId = created.id;
            } else {
              topId = topic.id;
            }
          }
        }"""

    new_wrong = """        // Match or create discipline and topic based on the names provided by the extension
        if (disciplinaName) {
          const userSettings = await storage.getUserSettings(user.id);
          let topics = await storage.getTopicsByUser(user.id);

          const discMatch = findBestDisciplineMatch(
            disciplines,
            disciplinaName,
            assuntoName,
            userSettings?.tecDisciplineAliases,
            topics,
          );
          let disc = discMatch.discipline;

          if (!disc) {
            const aiAnalysis = await analyzeDisciplineOrTopicWithAI({
              incomingDiscipline: disciplinaName,
              incomingTopic: assuntoName || "",
              existingDisciplines: disciplines,
              existingTopics: topics,
              userSettings,
            });
            if (aiAnalysis.matchedDisciplineId) {
              disc = disciplines.find((d) => d.id === aiAnalysis.matchedDisciplineId) || null;
            }
          }

          if (!disc) {
            const created = await storage.createDiscipline({
              userId: user.id,
              name: disciplinaName,
              color: "#e74c3c",
              weight: 1,
            });
            discId = created.id;
            disciplines = await storage.getDisciplinesByUser(user.id);
          } else {
            discId = disc.id;
          }

          if (assuntoName && discId) {
            topics = await storage.getTopicsByUser(user.id);
            const topicMatch = findBestTopicMatch(topics, assuntoName, discId);
            let topic = topicMatch.topic;
            if (!topic) {
              const created = await storage.createTopic({
                userId: user.id,
                disciplineId: discId,
                name: assuntoName,
                studyDate: new Date().toISOString(),
                notes: null,
              });
              topId = created.id;
            } else {
              topId = topic.id;
            }
          }
        }"""
    assert old_wrong in content, f'old_wrong not found in {filepath}'
    content = content.replace(old_wrong, new_wrong)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'{filepath} updated successfully')