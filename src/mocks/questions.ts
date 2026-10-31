import { ELECTRICITY_CONCEPTS, type Question, type ConceptProgress, type ConceptId } from "../contracts/tutor";

/** Reviewed illustrative question prompts; deterministic demo feedback is selected separately. */
const prompts:Record<ConceptId,string[]>={
  "electric-current-and-charge":["A charge of 12 C passes in 4 s. Calculate the current and explain your equation.","At 2 A, how much charge flows in 30 s? Explain your units.","Two wires carry equal current for different times. Which transfers more charge? Explain."],
  "potential-difference":["A cell does 18 J of work moving 3 C. What is the potential difference? Explain.","What does a potential difference of 6 V mean in terms of energy per charge?","If twice the charge moves through the same potential difference, how does the work change? Explain."],
  "resistance-and-ohms-law":["If voltage doubles while resistance stays constant, what happens to current? Explain why.","A 6 Ω resistor carries 2 A. What is the potential difference? Explain.","At fixed voltage, resistance triples. How does current change? Explain using Ohm's law."],
  "factors-affecting-resistance":["A wire is doubled in length at constant area and material. How does resistance change?","A wire's cross-sectional area doubles at fixed length and material. How does resistance change?","Two wires have equal length and area but different materials. Why may their resistance differ?"],
  "resistors-in-series":["Find the equivalent resistance of 2 Ω and 3 Ω in series. Explain.","Why is current the same through two resistors connected in series?","A 2 Ω and 4 Ω series pair is across 12 V. Find the current and each voltage drop."],
  "resistors-in-parallel":["Two 6 Ω resistors are in parallel. Find equivalent resistance and explain.","Why is potential difference the same across parallel branches?","A 3 Ω and 6 Ω parallel pair is across 6 V. Find both branch currents and total current."],
  "electric-power":["A device uses 12 V and 2 A. Calculate its power and explain units.","At the same voltage, which consumes more power: a 3 Ω or 6 Ω resistor? Explain.","Derive P = I²R from P = VI and Ohm's law."],
  "electrical-energy":["A 100 W lamp operates for 2 h. How much energy does it use in kWh?","Distinguish power in kW from energy in kWh using an example.","A 2 kW heater runs for 30 minutes. Find energy in kWh and joules."],
};
export function demoQuestion(conceptId:ConceptId,index:number):Question {
  const difficulty=(["easy","medium","hard"] as const)[index%3];
  const base={id:`demo-${conceptId}-${index}`,conceptId,difficulty,hint:"Identify the quantities held constant, choose the relationship, then explain each step with units."};
  if(conceptId==="resistance-and-ohms-law"&&index===1)return {...base,format:"multiple_choice",prompt:"At fixed resistance, voltage triples. What happens to current? Explain your selection.",options:[{id:"triple",text:"It triples"},{id:"third",text:"It becomes one third"},{id:"same",text:"It stays the same"}]};
  return {...base,format:"free_response",prompt:prompts[conceptId][index%3]};
}
export function unassessed():ConceptProgress[]{return ELECTRICITY_CONCEPTS.map(c=>({conceptId:c.id,mastery:null,state:"unassessed",evidenceCount:0,lastAssessedAt:null,nextReviewAt:null,recentMisconceptions:[]}));}
