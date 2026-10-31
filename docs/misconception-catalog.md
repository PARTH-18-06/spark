# Electricity misconception catalog coordination

Codes are stable backend identifiers. Labels may be improved or localized, but
a code must never be repurposed or generated from changing AI wording.

The shared v1.1.0 contract already agrees this code:

- `OHM_FIXED_RESISTANCE_CHANGES_WITH_VOLTAGE`

The database seed adds these proposed stable catalog codes for question/rubric
coordination. Frontend code should treat all codes as opaque strings:

- Current and charge: `CURRENT_CHARGE_TIME_INVERTED`,
  `CURRENT_CONSUMED_IN_CIRCUIT`
- Potential difference: `VOLTAGE_IS_CURRENT`,
  `VOLTAGE_WORK_CHARGE_MULTIPLY_ERROR`
- Ohm's law: `OHM_LAW_RATIO_INVERTED`
- Resistance factors: `RESISTANCE_AREA_DIRECT_PROPORTION`,
  `RESISTIVITY_DEPENDS_ON_DIMENSIONS`
- Series: `SERIES_CURRENT_SPLITS`, `SERIES_RESISTANCE_RECIPROCAL`
- Parallel: `PARALLEL_VOLTAGE_SPLITS`,
  `PARALLEL_RESISTANCE_EXCEEDS_BRANCH`
- Power: `POWER_ENERGY_SAME_QUANTITY`,
  `POWER_VOLTAGE_LINEAR_AT_FIXED_RESISTANCE`
- Energy: `KWH_IS_POWER`, `KWH_JOULE_CONVERSION_ERROR`

Adding, merging, or changing the meaning of a code requires backend/frontend
coordination. Historical observations retain their label/evidence snapshots.
