export type HealthProfile = 'none' | 'diabetes' | 'hypertension' | 'gluten-free' | 'weight-loss';

export type Language = 'english' | 'hindi' | 'marathi' | 'tamil' | 'bengali';

export interface FoodInput {
  text?: string;
  image?: string;
}

export interface Macros {
  protein: number;
  carbs: number;
  fats: number;
  calories: number;
}

export interface FoodAnalysis {
  isFood: boolean;
  score: number;
  theGood: string;
  theBad: string;
  theVerdict: string;
  alternatives: string[];
  localSuggestions: string[];
  macros: Macros;
}

export interface RecentScan {
  id: string;
  name: string;
  score: number;
  timestamp: number;
  image?: string;
  analysis: FoodAnalysis;
}

export interface DailyIntake {
  summary: string;
  macros: Macros;
  recommendations: string[];
}

export interface LoggedMeal {
  id: string;
  name: string;
  timestamp: number;
  macros?: Macros;
}
