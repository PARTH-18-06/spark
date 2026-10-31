-- Repeatable production-safe catalog seed for Spark Electricity v1.1.0.
-- This file changes catalog rows only. It never deletes or resets learner progress.
-- Questions are original Spark content reviewed against:
--   NCERT Class X Science, Chapter 11 Electricity (Reprint 2025-26):
--   https://www.ncert.nic.in/textbook/pdf/jesc111.pdf
--   CBSE Science curriculum 2025-26, competency C-2.4:
--   https://cbseacademic.nic.in/web_material/CurriculumMain26/Sec/Science_Sec_2025-26.pdf

begin;

insert into public.concepts (id, chapter_id, title, description, sort_order)
values
  ('electric-current-and-charge', 'class-10-physics-electricity', 'Electric current and charge', 'Charge flow, I = Q/t, amperes and coulombs.', 1),
  ('potential-difference', 'class-10-physics-electricity', 'Potential difference', 'Work per unit charge and the volt.', 2),
  ('resistance-and-ohms-law', 'class-10-physics-electricity', 'Resistance and Ohm''s law', 'Resistance and the relationship I = V/R.', 3),
  ('factors-affecting-resistance', 'class-10-physics-electricity', 'Factors affecting resistance', 'Length, cross-sectional area, material and temperature.', 4),
  ('resistors-in-series', 'class-10-physics-electricity', 'Resistors in series', 'Equivalent resistance, current and voltage in series.', 5),
  ('resistors-in-parallel', 'class-10-physics-electricity', 'Resistors in parallel', 'Equivalent resistance, branch currents and voltage in parallel.', 6),
  ('electric-power', 'class-10-physics-electricity', 'Electric power', 'P = VI and equivalent power relationships.', 7),
  ('electrical-energy', 'class-10-physics-electricity', 'Electrical energy', 'E = Pt, joules, kilowatt-hours and energy consumption.', 8)
on conflict (id) do update set
  chapter_id = excluded.chapter_id,
  title = excluded.title,
  description = excluded.description,
  sort_order = excluded.sort_order;

-- Synchronise only the contract-owned graph. Learner state is not touched.
delete from public.concept_prerequisites
where concept_id in (
  'electric-current-and-charge', 'potential-difference', 'resistance-and-ohms-law',
  'factors-affecting-resistance', 'resistors-in-series', 'resistors-in-parallel',
  'electric-power', 'electrical-energy'
);

insert into public.concept_prerequisites (concept_id, prerequisite_concept_id)
values
  ('potential-difference', 'electric-current-and-charge'),
  ('resistance-and-ohms-law', 'electric-current-and-charge'),
  ('resistance-and-ohms-law', 'potential-difference'),
  ('factors-affecting-resistance', 'resistance-and-ohms-law'),
  ('resistors-in-series', 'resistance-and-ohms-law'),
  ('resistors-in-parallel', 'resistance-and-ohms-law'),
  ('electric-power', 'resistance-and-ohms-law'),
  ('electrical-energy', 'electric-power');

insert into public.misconception_catalog (code, concept_id, label, description)
values
  ('CURRENT_CHARGE_TIME_INVERTED', 'electric-current-and-charge', 'Uses time divided by charge for current', 'Applies I = t/Q instead of I = Q/t.'),
  ('CURRENT_CONSUMED_IN_CIRCUIT', 'electric-current-and-charge', 'Treats current as consumed', 'Confuses transfer of electrical energy with consumption of charge.'),
  ('VOLTAGE_IS_CURRENT', 'potential-difference', 'Treats voltage and current as the same quantity', 'Does not distinguish work per charge from charge flow per time.'),
  ('VOLTAGE_WORK_CHARGE_MULTIPLY_ERROR', 'potential-difference', 'Uses charge divided by work for voltage', 'Inverts V = W/Q or W = VQ.'),
  ('OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE', 'resistance-and-ohms-law', 'Assumes voltage increases the fixed resistance', 'Changes R even when the problem explicitly holds resistance constant.'),
  ('OHM_LAW_RATIO_INVERTED', 'resistance-and-ohms-law', 'Inverts the Ohm''s law ratio', 'Uses R = I/V or I = R/V.'),
  ('RESISTANCE_AREA_DIRECT_PROPORTION', 'factors-affecting-resistance', 'Makes resistance increase with area', 'Misses the inverse relationship R proportional to 1/A.'),
  ('RESISTIVITY_DEPENDS_ON_DIMENSIONS', 'factors-affecting-resistance', 'Treats resistivity as a dimensional property', 'Confuses material resistivity with conductor resistance.'),
  ('SERIES_CURRENT_SPLITS', 'resistors-in-series', 'Splits current in a series circuit', 'Does not recognise the single current path in series.'),
  ('SERIES_RESISTANCE_RECIPROCAL', 'resistors-in-series', 'Uses the parallel reciprocal rule for series', 'Computes series equivalent resistance with reciprocal sums.'),
  ('PARALLEL_VOLTAGE_SPLITS', 'resistors-in-parallel', 'Splits voltage across parallel branches', 'Does not recognise equal branch potential difference.'),
  ('PARALLEL_RESISTANCE_EXCEEDS_BRANCH', 'resistors-in-parallel', 'Makes parallel equivalent resistance too large', 'Misses that adding a parallel path lowers equivalent resistance.'),
  ('POWER_ENERGY_SAME_QUANTITY', 'electric-power', 'Treats power and energy as the same quantity', 'Confuses rate of energy transfer with energy itself.'),
  ('POWER_VOLTAGE_LINEAR_AT_FIXED_RESISTANCE', 'electric-power', 'Uses a linear voltage rule for power at fixed resistance', 'Misses P = V^2/R when resistance is fixed.'),
  ('KWH_IS_POWER', 'electrical-energy', 'Treats kilowatt-hour as a power unit', 'Confuses kW with kWh.'),
  ('KWH_JOULE_CONVERSION_ERROR', 'electrical-energy', 'Uses an incorrect kWh-to-joule factor', 'Does not use 1 kWh = 3.6 million joules.')
on conflict (code) do update set
  concept_id = excluded.concept_id,
  label = excluded.label,
  description = excluded.description;

insert into public.question_bank
  (id, concept_id, format, difficulty, public_prompt, hint, expected_unit, options, content_version, source_reference, is_active)
values
  ('electricity_current_easy_01', 'electric-current-and-charge', 'multiple_choice', 'easy',
   'A charge of 10 C passes a point in 5 s. What is the current?', 'Use I = Q/t.', 'A',
   '[{"id":"a","text":"0.5 A"},{"id":"b","text":"2 A"},{"id":"c","text":"5 A"},{"id":"d","text":"50 A"}]', 1,
   'NCERT Class X Science, Electricity: electric current I = Q/t.', true),
  ('electricity_current_medium_01', 'electric-current-and-charge', 'free_response', 'medium',
   'A steady current of 0.50 A flows for 3.0 minutes. Calculate the charge transferred.', 'Convert minutes to seconds before using Q = It.', 'C', null, 1,
   'NCERT Class X Science, Electricity: current, charge and time.', true),
  ('electricity_current_hard_01', 'electric-current-and-charge', 'multiple_choice', 'hard',
   'Two wires carry 2 A for 30 s and 3 A for 20 s respectively. Which statement is correct?', 'Compare Q = It for each wire.', null,
   '[{"id":"a","text":"The first transfers more charge."},{"id":"b","text":"The second transfers more charge."},{"id":"c","text":"Both transfer 60 C."},{"id":"d","text":"Both transfer 5 C."}]', 1,
   'NCERT Class X Science, Electricity: Q = It.', true),

  ('electricity_voltage_easy_01', 'potential-difference', 'multiple_choice', 'easy',
   'If 12 J of work moves 3 C of charge, what is the potential difference?', 'Use V = W/Q.', 'V',
   '[{"id":"a","text":"0.25 V"},{"id":"b","text":"4 V"},{"id":"c","text":"9 V"},{"id":"d","text":"36 V"}]', 1,
   'NCERT Class X Science, Electricity: potential difference V = W/Q.', true),
  ('electricity_voltage_medium_01', 'potential-difference', 'free_response', 'medium',
   'How much work is done in moving 5 C of charge through a potential difference of 6 V?', 'Rearrange V = W/Q.', 'J', null, 1,
   'NCERT Class X Science, Electricity: W = VQ.', true),
  ('electricity_voltage_hard_01', 'potential-difference', 'multiple_choice', 'hard',
   'A 9 V battery transfers charge through a circuit. What does 9 V mean?', 'Interpret one volt as one joule per coulomb.', null,
   '[{"id":"a","text":"9 C passes each second."},{"id":"b","text":"Each coulomb gains 9 J of energy."},{"id":"c","text":"The resistance is 9 ohms."},{"id":"d","text":"The current is always 9 A."}]', 1,
   'NCERT Class X Science, Electricity: physical meaning of potential difference.', true),

  ('electricity_ohm_easy_01', 'resistance-and-ohms-law', 'multiple_choice', 'easy',
   'A 4 ohm resistor is connected across 12 V. What current flows?', 'Use I = V/R.', 'A',
   '[{"id":"a","text":"0.33 A"},{"id":"b","text":"3 A"},{"id":"c","text":"8 A"},{"id":"d","text":"48 A"}]', 1,
   'NCERT Class X Science, Electricity: Ohm''s law.', true),
  ('electricity_ohm_medium_01', 'resistance-and-ohms-law', 'free_response', 'medium',
   'A device draws 0.50 A when connected to 6 V. Calculate its resistance.', 'Use R = V/I.', 'ohm', null, 1,
   'NCERT Class X Science, Electricity: R = V/I.', true),
  ('electricity_ohm_hard_01', 'resistance-and-ohms-law', 'multiple_choice', 'hard',
   'The voltage across a fixed resistor doubles. What happens to its current?', 'The resistance is explicitly fixed.', null,
   '[{"id":"a","text":"It halves."},{"id":"b","text":"It stays the same."},{"id":"c","text":"It doubles."},{"id":"d","text":"It becomes zero."}]', 1,
   'NCERT Class X Science, Electricity: I = V/R at fixed resistance.', true),

  ('electricity_factors_easy_01', 'factors-affecting-resistance', 'multiple_choice', 'easy',
   'A wire is replaced by another of the same material and area but twice the length. How does resistance change?', 'Use R = rho L/A.', null,
   '[{"id":"a","text":"It halves."},{"id":"b","text":"It doubles."},{"id":"c","text":"It becomes four times."},{"id":"d","text":"It is unchanged."}]', 1,
   'NCERT Class X Science, Electricity: factors affecting resistance.', true),
  ('electricity_factors_medium_01', 'factors-affecting-resistance', 'free_response', 'medium',
   'Two wires have the same material and length. The second wire has twice the radius of the first. Express its resistance in terms of the first wire''s resistance R.', 'Area is proportional to radius squared and R is inversely proportional to area.', null, null, 1,
   'NCERT Class X Science, Electricity: R = rho L/A.', true),
  ('electricity_factors_hard_01', 'factors-affecting-resistance', 'multiple_choice', 'hard',
   'A wire is stretched to twice its original length without changing its volume or resistivity. What is its new resistance?', 'Constant volume makes the new area half the original area.', null,
   '[{"id":"a","text":"R/2"},{"id":"b","text":"R"},{"id":"c","text":"2R"},{"id":"d","text":"4R"}]', 1,
   'NCERT Class X Science, Electricity: resistance, length and area.', true),

  ('electricity_series_easy_01', 'resistors-in-series', 'multiple_choice', 'easy',
   'What is the equivalent resistance of 2 ohm and 3 ohm resistors in series?', 'Series resistances add.', 'ohm',
   '[{"id":"a","text":"1.2 ohm"},{"id":"b","text":"5 ohm"},{"id":"c","text":"6 ohm"},{"id":"d","text":"0.5 ohm"}]', 1,
   'NCERT Class X Science, Electricity: resistors in series.', true),
  ('electricity_series_medium_01', 'resistors-in-series', 'free_response', 'medium',
   'A 4 ohm resistor and a 6 ohm resistor are in series across 20 V. Find the circuit current and the voltage across each resistor.', 'First find total resistance, then use V = IR for each resistor.', 'A,V', null, 1,
   'NCERT Class X Science, Electricity: series current and voltage division.', true),
  ('electricity_series_hard_01', 'resistors-in-series', 'multiple_choice', 'hard',
   'Resistors of 2 ohm, 3 ohm and 6 ohm are in series across 22 V. What is the voltage across the 6 ohm resistor?', 'Find the common current from the total series resistance.', 'V',
   '[{"id":"a","text":"2 V"},{"id":"b","text":"6 V"},{"id":"c","text":"12 V"},{"id":"d","text":"22 V"}]', 1,
   'NCERT Class X Science, Electricity: series combination and V = IR.', true),

  ('electricity_parallel_easy_01', 'resistors-in-parallel', 'multiple_choice', 'easy',
   'What is the equivalent resistance of 6 ohm and 3 ohm resistors in parallel?', 'Use 1/R = 1/R1 + 1/R2.', 'ohm',
   '[{"id":"a","text":"2 ohm"},{"id":"b","text":"3 ohm"},{"id":"c","text":"9 ohm"},{"id":"d","text":"18 ohm"}]', 1,
   'NCERT Class X Science, Electricity: resistors in parallel.', true),
  ('electricity_parallel_medium_01', 'resistors-in-parallel', 'free_response', 'medium',
   'A 4 ohm resistor and a 12 ohm resistor are connected in parallel across 12 V. Calculate the total current.', 'Each branch has 12 V; add the two branch currents.', 'A', null, 1,
   'NCERT Class X Science, Electricity: branch voltage and current in parallel.', true),
  ('electricity_parallel_hard_01', 'resistors-in-parallel', 'multiple_choice', 'hard',
   'Resistors of 2 ohm, 3 ohm and 6 ohm are connected in parallel. What is their equivalent resistance?', 'Add reciprocal resistances.', 'ohm',
   '[{"id":"a","text":"1 ohm"},{"id":"b","text":"2 ohm"},{"id":"c","text":"6 ohm"},{"id":"d","text":"11 ohm"}]', 1,
   'NCERT Class X Science, Electricity: parallel equivalent resistance.', true),

  ('electricity_power_easy_01', 'electric-power', 'multiple_choice', 'easy',
   'A device operates at 12 V and draws 2 A. What power does it use?', 'Use P = VI.', 'W',
   '[{"id":"a","text":"6 W"},{"id":"b","text":"14 W"},{"id":"c","text":"24 W"},{"id":"d","text":"144 W"}]', 1,
   'NCERT Class X Science, Electricity: electric power P = VI.', true),
  ('electricity_power_medium_01', 'electric-power', 'free_response', 'medium',
   'A 10 ohm heater carries a current of 3 A. Calculate its power.', 'Use P = I squared times R.', 'W', null, 1,
   'NCERT Class X Science, Electricity: P = I^2R.', true),
  ('electricity_power_hard_01', 'electric-power', 'multiple_choice', 'hard',
   'The voltage across a fixed resistor doubles. By what factor does its power change?', 'At fixed resistance, P = V squared divided by R.', null,
   '[{"id":"a","text":"It halves."},{"id":"b","text":"It doubles."},{"id":"c","text":"It becomes four times."},{"id":"d","text":"It is unchanged."}]', 1,
   'NCERT Class X Science, Electricity: P = V^2/R.', true),

  ('electricity_energy_easy_01', 'electrical-energy', 'multiple_choice', 'easy',
   'A 100 W lamp runs for 2 hours. How much electrical energy does it use?', 'Convert watts to kilowatts, then multiply by hours.', 'kWh',
   '[{"id":"a","text":"0.02 kWh"},{"id":"b","text":"0.2 kWh"},{"id":"c","text":"2 kWh"},{"id":"d","text":"200 kWh"}]', 1,
   'NCERT Class X Science, Electricity: electrical energy in kWh.', true),
  ('electricity_energy_medium_01', 'electrical-energy', 'free_response', 'medium',
   'A 2.0 kW appliance runs for 30 minutes. Calculate the energy used in kWh and in joules.', '30 minutes is 0.5 hour; 1 kWh equals 3.6 million joules.', 'kWh,J', null, 1,
   'NCERT Class X Science, Electricity: 1 kWh = 3.6 x 10^6 J.', true),
  ('electricity_energy_hard_01', 'electrical-energy', 'multiple_choice', 'hard',
   'A 1.5 kW heater runs for 4 hours per day for 30 days. How much energy does it use?', 'Multiply power by total operating time.', 'kWh',
   '[{"id":"a","text":"45 kWh"},{"id":"b","text":"120 kWh"},{"id":"c","text":"180 kWh"},{"id":"d","text":"240 kWh"}]', 1,
   'NCERT Class X Science, Electricity: commercial energy calculation.', true)
on conflict (id) do update set
  concept_id = excluded.concept_id,
  format = excluded.format,
  difficulty = excluded.difficulty,
  public_prompt = excluded.public_prompt,
  hint = excluded.hint,
  expected_unit = excluded.expected_unit,
  options = excluded.options,
  content_version = excluded.content_version,
  source_reference = excluded.source_reference,
  is_active = excluded.is_active;

insert into public.question_rubrics
  (question_id, rubric_version, correct_answer, worked_solution, reasoning_rubric, numeric_answer, numeric_tolerance, expected_unit)
values
  ('electricity_current_easy_01', 1, '{"selectedOptionId":"b"}', 'I = Q/t = 10/5 = 2 A.', '{"required":["I = Q/t","2 A"]}', 2, 0.01, 'A'),
  ('electricity_current_medium_01', 1, '{"numericValue":90,"unit":"C"}', '3.0 min = 180 s, so Q = It = 0.50 x 180 = 90 C.', '{"required":["convert 3 min to 180 s","Q = It","90 C"]}', 90, 0.1, 'C'),
  ('electricity_current_hard_01', 1, '{"selectedOptionId":"c"}', 'Q1 = 2 x 30 = 60 C and Q2 = 3 x 20 = 60 C.', '{"required":["calculate both with Q = It","both 60 C"]}', 60, 0.01, 'C'),

  ('electricity_voltage_easy_01', 1, '{"selectedOptionId":"b"}', 'V = W/Q = 12/3 = 4 V.', '{"required":["V = W/Q","4 V"]}', 4, 0.01, 'V'),
  ('electricity_voltage_medium_01', 1, '{"numericValue":30,"unit":"J"}', 'W = VQ = 6 x 5 = 30 J.', '{"required":["W = VQ","30 J"]}', 30, 0.01, 'J'),
  ('electricity_voltage_hard_01', 1, '{"selectedOptionId":"b"}', 'Potential difference is work per charge, so 9 V means 9 J per C.', '{"required":["voltage is work per charge","9 J per C"]}', 9, 0.01, 'J/C'),

  ('electricity_ohm_easy_01', 1, '{"selectedOptionId":"b"}', 'I = V/R = 12/4 = 3 A.', '{"required":["I = V/R","3 A"]}', 3, 0.01, 'A'),
  ('electricity_ohm_medium_01', 1, '{"numericValue":12,"unit":"ohm"}', 'R = V/I = 6/0.50 = 12 ohm.', '{"required":["R = V/I","12 ohm"]}', 12, 0.01, 'ohm'),
  ('electricity_ohm_hard_01', 1, '{"selectedOptionId":"c"}', 'At fixed R, I = V/R, so doubling V doubles I.', '{"required":["resistance stays fixed","I is proportional to V","current doubles"]}', null, null, null),

  ('electricity_factors_easy_01', 1, '{"selectedOptionId":"b"}', 'R = rho L/A, so doubling L at fixed rho and A doubles R.', '{"required":["R proportional to length","resistance doubles"]}', null, null, null),
  ('electricity_factors_medium_01', 1, '{"acceptedExpression":"R/4"}', 'Doubling radius makes area four times larger. Since R is inversely proportional to area, the new resistance is R/4.', '{"required":["area becomes four times","resistance is inversely proportional to area","R/4"]}', 0.25, 0.001, 'times R'),
  ('electricity_factors_hard_01', 1, '{"selectedOptionId":"d"}', 'Constant volume gives A'' = A/2 when L'' = 2L. Thus R'' = rho(2L)/(A/2) = 4R.', '{"required":["new area is half","use R = rho L/A","4R"]}', 4, 0.001, 'times R'),

  ('electricity_series_easy_01', 1, '{"selectedOptionId":"b"}', 'Series resistance is 2 + 3 = 5 ohm.', '{"required":["series resistances add","5 ohm"]}', 5, 0.01, 'ohm'),
  ('electricity_series_medium_01', 1, '{"currentA":2,"voltage4OhmV":8,"voltage6OhmV":12}', 'Total R = 10 ohm, so I = 20/10 = 2 A. The drops are 2 x 4 = 8 V and 2 x 6 = 12 V.', '{"required":["total resistance 10 ohm","current 2 A","voltage drops 8 V and 12 V"]}', 2, 0.01, 'A'),
  ('electricity_series_hard_01', 1, '{"selectedOptionId":"c"}', 'Total R = 11 ohm, current = 22/11 = 2 A, and V across 6 ohm = 12 V.', '{"required":["total resistance 11 ohm","current 2 A","12 V across 6 ohm"]}', 12, 0.01, 'V'),

  ('electricity_parallel_easy_01', 1, '{"selectedOptionId":"a"}', '1/R = 1/6 + 1/3 = 1/2, so R = 2 ohm.', '{"required":["reciprocal sum","2 ohm"]}', 2, 0.01, 'ohm'),
  ('electricity_parallel_medium_01', 1, '{"numericValue":4,"unit":"A"}', 'Branch currents are 12/4 = 3 A and 12/12 = 1 A, giving 4 A total.', '{"required":["same 12 V across branches","branch currents 3 A and 1 A","total 4 A"]}', 4, 0.01, 'A'),
  ('electricity_parallel_hard_01', 1, '{"selectedOptionId":"a"}', '1/R = 1/2 + 1/3 + 1/6 = 1, so R = 1 ohm.', '{"required":["sum all reciprocals","1 ohm"]}', 1, 0.01, 'ohm'),

  ('electricity_power_easy_01', 1, '{"selectedOptionId":"c"}', 'P = VI = 12 x 2 = 24 W.', '{"required":["P = VI","24 W"]}', 24, 0.01, 'W'),
  ('electricity_power_medium_01', 1, '{"numericValue":90,"unit":"W"}', 'P = I^2R = 3^2 x 10 = 90 W.', '{"required":["P = I^2R","90 W"]}', 90, 0.01, 'W'),
  ('electricity_power_hard_01', 1, '{"selectedOptionId":"c"}', 'At fixed R, P = V^2/R. Doubling V makes power four times larger.', '{"required":["P = V^2/R","square the voltage factor","four times"]}', 4, 0.001, 'factor'),

  ('electricity_energy_easy_01', 1, '{"selectedOptionId":"b"}', '100 W = 0.1 kW; E = Pt = 0.1 x 2 = 0.2 kWh.', '{"required":["convert 100 W to 0.1 kW","multiply by 2 h","0.2 kWh"]}', 0.2, 0.001, 'kWh'),
  ('electricity_energy_medium_01', 1, '{"energyKWh":1,"energyJ":3600000}', '30 min = 0.5 h. E = 2.0 x 0.5 = 1.0 kWh = 3.6 x 10^6 J.', '{"required":["convert 30 min to 0.5 h","1 kWh","3.6 million J"]}', 1, 0.001, 'kWh'),
  ('electricity_energy_hard_01', 1, '{"selectedOptionId":"c"}', 'Total time is 4 x 30 = 120 h; E = 1.5 x 120 = 180 kWh.', '{"required":["total time 120 h","E = Pt","180 kWh"]}', 180, 0.01, 'kWh')
on conflict (question_id, rubric_version) do update set
  correct_answer = excluded.correct_answer,
  worked_solution = excluded.worked_solution,
  reasoning_rubric = excluded.reasoning_rubric,
  numeric_answer = excluded.numeric_answer,
  numeric_tolerance = excluded.numeric_tolerance,
  expected_unit = excluded.expected_unit;

delete from public.question_misconceptions
where question_id like 'electricity\_%' escape '\';

insert into public.question_misconceptions (question_id, misconception_code)
values
  ('electricity_current_easy_01', 'CURRENT_CHARGE_TIME_INVERTED'),
  ('electricity_current_medium_01', 'CURRENT_CHARGE_TIME_INVERTED'),
  ('electricity_current_hard_01', 'CURRENT_CONSUMED_IN_CIRCUIT'),
  ('electricity_voltage_easy_01', 'VOLTAGE_WORK_CHARGE_MULTIPLY_ERROR'),
  ('electricity_voltage_medium_01', 'VOLTAGE_WORK_CHARGE_MULTIPLY_ERROR'),
  ('electricity_voltage_hard_01', 'VOLTAGE_IS_CURRENT'),
  ('electricity_ohm_easy_01', 'OHM_LAW_RATIO_INVERTED'),
  ('electricity_ohm_medium_01', 'OHM_LAW_RATIO_INVERTED'),
  ('electricity_ohm_hard_01', 'OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE'),
  ('electricity_factors_easy_01', 'RESISTIVITY_DEPENDS_ON_DIMENSIONS'),
  ('electricity_factors_medium_01', 'RESISTANCE_AREA_DIRECT_PROPORTION'),
  ('electricity_factors_hard_01', 'RESISTANCE_AREA_DIRECT_PROPORTION'),
  ('electricity_series_easy_01', 'SERIES_RESISTANCE_RECIPROCAL'),
  ('electricity_series_medium_01', 'SERIES_CURRENT_SPLITS'),
  ('electricity_series_hard_01', 'SERIES_CURRENT_SPLITS'),
  ('electricity_parallel_easy_01', 'PARALLEL_RESISTANCE_EXCEEDS_BRANCH'),
  ('electricity_parallel_medium_01', 'PARALLEL_VOLTAGE_SPLITS'),
  ('electricity_parallel_hard_01', 'PARALLEL_RESISTANCE_EXCEEDS_BRANCH'),
  ('electricity_power_easy_01', 'POWER_ENERGY_SAME_QUANTITY'),
  ('electricity_power_medium_01', 'POWER_ENERGY_SAME_QUANTITY'),
  ('electricity_power_hard_01', 'POWER_VOLTAGE_LINEAR_AT_FIXED_RESISTANCE'),
  ('electricity_energy_easy_01', 'KWH_IS_POWER'),
  ('electricity_energy_medium_01', 'KWH_JOULE_CONVERSION_ERROR'),
  ('electricity_energy_hard_01', 'KWH_IS_POWER');

commit;
