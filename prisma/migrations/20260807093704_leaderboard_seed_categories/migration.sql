-- Data-only: seeds the 20 default ScoreCategory rows and 11
-- AchievementDefinition rows as org-level templates (campId IS NULL), per
-- the product spec. Deliberately separate from the structural migration
-- above, and safe to re-run/resume (each row's id is a fixed literal, guarded
-- by "ON CONFLICT (id) DO NOTHING" rather than an application-logic UPDATE).

INSERT INTO "ScoreCategory" ("id", "campId", "key", "name", "defaultPoints", "kind", "isPenalty", "enabled", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('seed-cat-attendance',          NULL, 'ATTENDANCE',            'Attendance',              10, 'AUTO',   false, true, 0,  now(), now()),
  ('seed-cat-promptness',          NULL, 'PROMPTNESS',            'Promptness',              10, 'AUTO',   false, true, 1,  now(), now()),
  ('seed-cat-cleaning',            NULL, 'CLEANING',              'Cleaning',                15, 'MANUAL', false, true, 2,  now(), now()),
  ('seed-cat-bible-study',         NULL, 'BIBLE_STUDY',           'Bible Study',             10, 'BOTH',   false, true, 3,  now(), now()),
  ('seed-cat-morning-devotion',    NULL, 'MORNING_DEVOTION',      'Morning Devotion',        10, 'BOTH',   false, true, 4,  now(), now()),
  ('seed-cat-sports',              NULL, 'SPORTS',                'Sports',                  20, 'MANUAL', false, true, 5,  now(), now()),
  ('seed-cat-drama',               NULL, 'DRAMA',                 'Drama',                   20, 'MANUAL', false, true, 6,  now(), now()),
  ('seed-cat-talent-show',         NULL, 'TALENT_SHOW',           'Talent Show',             20, 'MANUAL', false, true, 7,  now(), now()),
  ('seed-cat-bible-quiz',          NULL, 'BIBLE_QUIZ',            'Bible Quiz',              25, 'MANUAL', false, true, 8,  now(), now()),
  ('seed-cat-memory-verse',        NULL, 'MEMORY_VERSE',          'Memory Verse',            15, 'MANUAL', false, true, 9,  now(), now()),
  ('seed-cat-hostel-inspection',   NULL, 'HOSTEL_INSPECTION',     'Hostel Inspection',       15, 'MANUAL', false, true, 10, now(), now()),
  ('seed-cat-neatness',            NULL, 'NEATNESS',              'Neatness',                10, 'MANUAL', false, true, 11, now(), now()),
  ('seed-cat-hall-arrangement',    NULL, 'HALL_ARRANGEMENT',      'Hall Arrangement',        10, 'MANUAL', false, true, 12, now(), now()),
  ('seed-cat-food-queue',          NULL, 'FOOD_QUEUE_DISCIPLINE', 'Food Queue Discipline',   10, 'MANUAL', false, true, 13, now(), now()),
  ('seed-cat-leadership',          NULL, 'LEADERSHIP',            'Leadership',              20, 'MANUAL', false, true, 14, now(), now()),
  ('seed-cat-service',             NULL, 'SERVICE',               'Service',                 15, 'MANUAL', false, true, 15, now(), now()),
  ('seed-cat-teamwork',            NULL, 'TEAMWORK',              'Teamwork',                15, 'MANUAL', false, true, 16, now(), now()),
  ('seed-cat-spirit-award',        NULL, 'SPIRIT_AWARD',          'Spirit Award',            25, 'MANUAL', false, true, 17, now(), now()),
  ('seed-cat-special-recognition', NULL, 'SPECIAL_RECOGNITION',   'Special Recognition',     30, 'MANUAL', false, true, 18, now(), now()),
  ('seed-cat-penalty',             NULL, 'PENALTY',               'Penalty',                -10, 'MANUAL', true,  true, 19, now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AchievementDefinition" ("id", "campId", "key", "name", "subjectType", "enabled", "createdAt", "updatedAt")
VALUES
  ('seed-ach-perfect-attendance', NULL, 'PERFECT_ATTENDANCE', 'Perfect Attendance', 'TRIBE',  true, now(), now()),
  ('seed-ach-early-bird',         NULL, 'EARLY_BIRD',         'Early Bird',         'CAMPER', true, now(), now()),
  ('seed-ach-bible-scholar',      NULL, 'BIBLE_SCHOLAR',      'Bible Scholar',      'CAMPER', true, now(), now()),
  ('seed-ach-sports-champion',    NULL, 'SPORTS_CHAMPION',    'Sports Champion',    'TRIBE',  true, now(), now()),
  ('seed-ach-drama-champion',     NULL, 'DRAMA_CHAMPION',     'Drama Champion',     'TRIBE',  true, now(), now()),
  ('seed-ach-best-teamwork',      NULL, 'BEST_TEAMWORK',      'Best Teamwork',      'TRIBE',  true, now(), now()),
  ('seed-ach-camp-star',          NULL, 'CAMP_STAR',          'Camp Star',          'CAMPER', true, now(), now()),
  ('seed-ach-outstanding-leader', NULL, 'OUTSTANDING_LEADER', 'Outstanding Leader', 'CAMPER', true, now(), now()),
  ('seed-ach-cleanest-hostel',    NULL, 'CLEANEST_HOSTEL',    'Cleanest Hostel',    'TRIBE',  true, now(), now()),
  ('seed-ach-most-improved',      NULL, 'MOST_IMPROVED',      'Most Improved',      'TRIBE',  true, now(), now()),
  ('seed-ach-top-teacher',        NULL, 'TOP_TEACHER',        'Top Teacher',        'STAFF',  true, now(), now())
ON CONFLICT ("id") DO NOTHING;
