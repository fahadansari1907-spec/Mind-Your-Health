import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, Search, Loader2, Apple, AlertCircle, MapPin, History, Plus, Trash2, LayoutDashboard, UserCircle, Calculator, Navigation, Mic, MicOff, Languages, HeartPulse, Utensils, LogIn, LogOut, RefreshCcw, CheckCircle2, XCircle, Info, Target, Flame, Beef, Wheat, Droplets, Sparkles, ArrowRight, Clock } from 'lucide-react';
import { analyzeFood, calculateDailyIntake, estimateRequirements, generateHealthyRecipe } from './services/geminiService';
import { HealthProfile, Language, LoggedMeal, FoodAnalysis, DailyIntake, Macros, RecentScan } from './types';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged, doc, collection, setDoc, getDoc, onSnapshot, query, orderBy, deleteDoc, User, handleFirestoreError, OperationType } from './firebase';

type Tab = 'analyze' | 'tracker' | 'plan';

const MacroChart = ({ macros }: { macros: Macros }) => {
  const data = [
    { name: 'Protein', value: macros.protein, color: '#10b981' },
    { name: 'Carbs', value: macros.carbs, color: '#3b82f6' },
    { name: 'Fats', value: macros.fats, color: '#f59e0b' },
  ];

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={60}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            formatter={(value: number) => [`${value}g`]}
          />
          <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('analyze');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Analysis State
  const [input, setInput] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FoodAnalysis | null>(null);
  const [location, setLocation] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [profile, setProfile] = useState<HealthProfile>('none');
  const [language, setLanguage] = useState<Language>('english');
  const [isListening, setIsListening] = useState(false);
  const [recipeResult, setRecipeResult] = useState<string | null>(null);
  const [recipeLoading, setRecipeLoading] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tracker State
  const [meals, setMeals] = useState<LoggedMeal[]>([]);
  const [mealInput, setMealInput] = useState('');
  const [trackerResult, setTrackerResult] = useState<DailyIntake | null>(null);
  const [trackerLoading, setTrackerLoading] = useState(false);

  // Plan State
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState('moderate');
  const [planResult, setPlanResult] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Sync Profile from Firestore
  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      setIsSyncing(true);
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          if (data.profile) setProfile(data.profile as HealthProfile);
          if (data.language) setLanguage(data.language as Language);
          if (data.age) setAge(data.age);
          if (data.weight) setWeight(data.weight);
          if (data.activity) setActivity(data.activity);
        } else {
          // Initialize user doc
          await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            profile: 'none',
            language: 'english',
            updatedAt: new Date().toISOString()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      } finally {
        setIsSyncing(false);
      }
    };

    fetchProfile();
  }, [user]);

  // Sync Meals from Firestore
  useEffect(() => {
    if (!user) {
      // Load from local storage if not logged in
      const savedMeals = localStorage.getItem('myh_meals');
      if (savedMeals) {
        try {
          const parsed = JSON.parse(savedMeals);
          const today = new Date().setHours(0, 0, 0, 0);
          const filtered = parsed.filter((m: LoggedMeal) => m.timestamp >= today);
          setMeals(filtered);
        } catch (e) {
          console.error('Failed to parse meals', e);
        }
      }
      return;
    }

    const today = new Date().setHours(0, 0, 0, 0);
    const q = query(
      collection(db, 'users', user.uid, 'meals'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMeals = snapshot.docs
        .map(doc => doc.data() as LoggedMeal)
        .filter(m => m.timestamp >= today);
      setMeals(fetchedMeals);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, `users/${user.uid}/meals`);
    });

    return () => unsubscribe();
  }, [user]);

  // Load Recent Scans
  useEffect(() => {
    const saved = localStorage.getItem('myh_recent_scans');
    if (saved) {
      try {
        setRecentScans(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse recent scans', e);
      }
    }
  }, []);

  // Save Recent Scans
  useEffect(() => {
    localStorage.setItem('myh_recent_scans', JSON.stringify(recentScans));
  }, [recentScans]);

  // Save to local storage only if NOT logged in
  useEffect(() => {
    if (!user) {
      localStorage.setItem('myh_meals', JSON.stringify(meals));
    }
  }, [meals, user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Login failed', err);
      setError('Login failed. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setMeals([]);
      setProfile('none');
      setLanguage('english');
      setAge('');
      setWeight('');
      setActivity('moderate');
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  const updateProfileInFirestore = async (updates: Partial<any>) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...updates,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGetLiveLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          // Use OpenStreetMap's Nominatim for simple reverse geocoding
          const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`);
          const data = await response.json();
          const city = data.address.city || data.address.town || data.address.village || data.address.state || data.address.country;
          setLocation(city);
        } catch (error) {
          console.error('Error fetching location name:', error);
          setLocation(`${latitude.toFixed(2)}, ${longitude.toFixed(2)}`);
        } finally {
          setLocationLoading(false);
        }
      },
      (error) => {
        console.error('Error getting location:', error);
        setError('Could not get your location. Please check your permissions.');
        setLocationLoading(false);
      }
    );
  };

  const handleAnalyze = async () => {
    if (!input && !image) return;
    setLoading(true);
    setResult(null);
    setRecipeResult(null);
    try {
      const analysis = await analyzeFood({ text: input, image: image || undefined }, location, profile, language);
      
      if (!analysis.isFood) {
        setError("I don't think this is a food item. Please scan a meal or a nutrition label.");
        setLoading(false);
        return;
      }

      setResult(analysis);
      
      // Add to recent scans
      const newScan: RecentScan = {
        id: Date.now().toString(),
        name: input || (image ? "Image Scan" : "Food Analysis"),
        score: analysis.score,
        timestamp: Date.now(),
        image: image || undefined,
        analysis: analysis
      };
      setRecentScans(prev => [newScan, ...prev].slice(0, 3));

    } catch (error) {
      console.error(error);
      setError('Error analyzing food. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Voice recognition is not supported in your browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === 'hindi' ? 'hi-IN' : 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Silently handle no-speech or show a subtle hint
        console.log('No speech detected.');
      } else {
        console.error('Speech recognition error:', event.error);
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev ? `${prev} ${transcript}` : transcript);
    };

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  const handleGetRecipe = async () => {
    if (!input && !image) return;
    setRecipeLoading(true);
    try {
      const foodName = input || "this food item";
      const recipe = await generateHealthyRecipe(foodName, language);
      setRecipeResult(recipe || 'Could not generate a recipe.');
    } catch (error) {
      console.error(error);
      setRecipeResult('Error generating recipe. Please try again.');
    } finally {
      setRecipeLoading(false);
    }
  };

  const handleAddMeal = async () => {
    if (!mealInput.trim()) return;
    const newMeal: LoggedMeal = {
      id: Date.now().toString(),
      name: mealInput.trim(),
      timestamp: Date.now(),
    };

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'meals', newMeal.id), newMeal);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/meals/${newMeal.id}`);
      }
    } else {
      setMeals([...meals, newMeal]);
    }
    setMealInput('');
  };

  const removeMeal = async (id: string) => {
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'meals', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/meals/${id}`);
      }
    } else {
      setMeals(meals.filter(m => m.id !== id));
    }
  };

  const handleCalculateTracker = async () => {
    if (meals.length === 0) return;
    setTrackerLoading(true);
    try {
      const summary = await calculateDailyIntake(meals.map(m => m.name), language);
      setTrackerResult(summary);
    } catch (error) {
      console.error(error);
      setError('Error calculating intake. Please try again.');
    } finally {
      setTrackerLoading(false);
    }
  };

  const handleCalculatePlan = async () => {
    if (!age || !weight) return;
    setPlanLoading(true);
    try {
      if (user) {
        await updateProfileInFirestore({ age, weight, activity });
      }
      const plan = await estimateRequirements(age, weight, activity);
      setPlanResult(plan || 'Could not estimate requirements.');
    } catch (error) {
      console.error(error);
      setPlanResult('Error estimating requirements. Please try again.');
    } finally {
      setPlanLoading(false);
    }
  };

  const clearAll = () => {
    setInput('');
    setImage(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleNumberInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['-', 'e', '+'].includes(e.key)) {
      e.preventDefault();
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Apple className="w-12 h-12 text-emerald-500 animate-bounce mb-4" />
        <p className="text-slate-600 font-medium animate-pulse">Initializing Mind Your Health...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Error/Notification Banner */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-[100] flex justify-center pointer-events-none"
          >
            <div className="bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-slate-700 pointer-events-auto max-w-lg w-full">
              <div className="bg-red-500/20 p-2 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-sm font-bold flex-1">{error}</p>
              <button 
                onClick={() => setError(null)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-emerald-500 p-2 rounded-xl">
              <Apple className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Mind Your Health</h1>
          </div>
          <div className="flex items-center gap-3">
            {isSyncing && <RefreshCcw className="w-4 h-4 text-emerald-500 animate-spin" />}
            {user ? (
              <div className="flex items-center gap-2">
                <img src={user.photoURL || ''} alt="Avatar" className="w-8 h-8 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                <button onClick={handleLogout} className="text-slate-500 hover:text-red-500 transition-colors">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button onClick={handleLogin} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition-all">
                <LogIn className="w-4 h-4" />
                Sign In
              </button>
            )}
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 pb-4">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('analyze')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'analyze' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Analyze
            </button>
            <button 
              onClick={() => setActiveTab('tracker')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'tracker' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Tracker
            </button>
            <button 
              onClick={() => setActiveTab('plan')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'plan' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Plan
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-8">
        <AnimatePresence mode="wait">
          {activeTab === 'analyze' ? (
            <motion.div 
              key="analyze-tab"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {!result && (
                <div className="space-y-6">
                  {recentScans.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden"
                    >
                      <div className="relative z-10 space-y-4">
                        <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center backdrop-blur-md">
                          <Sparkles className="w-6 h-6 text-emerald-100" />
                        </div>
                        <h2 className="text-2xl font-black leading-tight">Welcome to Mind Your Health!</h2>
                        <p className="text-emerald-50/80 text-sm font-medium leading-relaxed">
                          Start by scanning your meal or typing what you ate. I'll analyze the nutrition and give you a health score.
                        </p>
                        <div className="flex flex-wrap gap-3 pt-2">
                          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                            <Camera className="w-3 h-3" /> Photo Scan
                          </div>
                          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                            <Mic className="w-3 h-3" /> Voice Input
                          </div>
                          <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                            <Navigation className="w-3 h-3" /> Local Tips
                          </div>
                        </div>
                      </div>
                      <div className="absolute -right-8 -bottom-8 w-48 h-48 bg-white/10 rounded-full blur-3xl" />
                    </motion.div>
                  ) : (
                    <div className="text-center space-y-2 mb-8">
                      <h2 className="text-3xl font-bold text-slate-900">What are you eating?</h2>
                      <p className="text-slate-500 text-sm">Analyze your food to see if it's healthy or not.</p>
                    </div>
                  )}

                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
                    {/* Text Input */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                          <Search className="w-4 h-4" />
                          Food Name or Ingredients
                        </label>
                        <button
                          onClick={handleVoiceInput}
                          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                          {isListening ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                          {isListening ? 'Listening...' : 'Use Voice'}
                        </button>
                      </div>
                      <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="e.g. Chocolate cream biscuits, or list ingredients..."
                        className="w-full min-h-[100px] p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all resize-none"
                      />
                    </div>

                    {/* Profile & Language */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                          <HeartPulse className="w-4 h-4" />
                          Health Profile
                        </label>
                        <select
                          value={profile}
                          onChange={(e) => {
                            const val = e.target.value as HealthProfile;
                            setProfile(val);
                            updateProfileInFirestore({ profile: val });
                          }}
                          className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white text-sm"
                        >
                          <option value="none">General (None)</option>
                          <option value="diabetes">Diabetes</option>
                          <option value="hypertension">Hypertension</option>
                          <option value="gluten-free">Gluten-Free</option>
                          <option value="weight-loss">Weight Loss</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                          <Languages className="w-4 h-4" />
                          Language
                        </label>
                        <select
                          value={language}
                          onChange={(e) => {
                            const val = e.target.value as Language;
                            setLanguage(val);
                            updateProfileInFirestore({ language: val });
                          }}
                          className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white text-sm"
                        >
                          <option value="english">English</option>
                          <option value="hindi">Hindi (हिंदी)</option>
                          <option value="marathi">Marathi (मराठी)</option>
                          <option value="tamil">Tamil (தமிழ்)</option>
                          <option value="bengali">Bengali (বাংলা)</option>
                        </select>
                      </div>
                    </div>

                    {/* Image Input */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <Camera className="w-4 h-4" />
                        Upload Photo
                      </label>
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all ${image ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-emerald-400 hover:bg-slate-50'}`}
                      >
                        {image ? (
                          <div className="relative w-full aspect-video rounded-lg overflow-hidden">
                            <img src={image} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                              <p className="text-white font-medium text-sm">Change Photo</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <Upload className="w-10 h-10 text-slate-400 mb-2" />
                            <p className="text-slate-600 font-medium text-sm">Click to upload or drag and drop</p>
                            <p className="text-slate-400 text-xs text-center">Take a photo of your food or its label</p>
                          </>
                        )}
                        <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          accept="image/*"
                          className="hidden"
                        />
                      </div>
                    </div>

                    {/* Location Input */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Your Location
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. India, USA, London..."
                          className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                        />
                        <button
                          onClick={handleGetLiveLocation}
                          disabled={locationLoading}
                          title="Use Live Location"
                          className={`p-3 rounded-xl border border-slate-200 transition-all flex items-center justify-center ${locationLoading ? 'bg-slate-50 text-slate-400' : 'bg-white text-emerald-600 hover:border-emerald-500 hover:bg-emerald-50'}`}
                        >
                          {locationLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Navigation className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleAnalyze}
                      disabled={loading || (!input && !image)}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        'Analyze Health'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {result && (
                <div className="space-y-6">
                  <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
                    {/* Result Header */}
                    <div className="bg-emerald-500 p-8 text-white relative overflow-hidden">
                      <div className="relative z-10 flex items-center justify-between">
                        <div>
                          <h2 className="text-2xl font-black tracking-tight">Analysis Result</h2>
                          <p className="text-emerald-100 font-medium">Smart health breakdown</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/30 text-center">
                            <p className="text-[10px] uppercase font-black tracking-widest opacity-80">Health Score</p>
                            <p className="text-3xl font-black">{result.score}</p>
                          </div>
                          {image && (
                            <img src={image} alt="Analyzed" className="w-20 h-20 rounded-2xl object-cover border-4 border-white/20 shadow-lg" referrerPolicy="no-referrer" />
                          )}
                        </div>
                      </div>
                      {/* Decorative background circle */}
                      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
                    </div>
                    
                    <div className="p-6 space-y-6">
                      {/* Macro Breakdown Card */}
                      <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-black text-slate-800 flex items-center gap-2">
                            <Flame className="w-5 h-5 text-orange-500" />
                            Nutritional Breakdown
                          </h3>
                          <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-black">
                            {result.macros.calories} kcal
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                          <MacroChart macros={result.macros} />
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                              <div className="flex items-center gap-2">
                                <Beef className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm font-bold text-slate-600">Protein</span>
                              </div>
                              <span className="font-black text-slate-900">{result.macros.protein}g</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                              <div className="flex items-center gap-2">
                                <Wheat className="w-4 h-4 text-blue-500" />
                                <span className="text-sm font-bold text-slate-600">Carbs</span>
                              </div>
                              <span className="font-black text-slate-900">{result.macros.carbs}g</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100 shadow-sm">
                              <div className="flex items-center gap-2">
                                <Droplets className="w-4 h-4 text-amber-500" />
                                <span className="text-sm font-bold text-slate-600">Fats</span>
                              </div>
                              <span className="font-black text-slate-900">{result.macros.fats}g</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bento Cards for Text */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 }}
                          className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100 space-y-2"
                        >
                          <div className="flex items-center gap-2 text-emerald-700 font-black text-sm">
                            <CheckCircle2 className="w-4 h-4" />
                            THE GOOD
                          </div>
                          <p className="text-slate-700 text-sm leading-relaxed font-medium">{result.theGood}</p>
                        </motion.div>

                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="bg-red-50 p-5 rounded-2xl border border-red-100 space-y-2"
                        >
                          <div className="flex items-center gap-2 text-red-700 font-black text-sm">
                            <XCircle className="w-4 h-4" />
                            THE BAD
                          </div>
                          <p className="text-slate-700 text-sm leading-relaxed font-medium">{result.theBad}</p>
                        </motion.div>

                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="md:col-span-2 bg-blue-50 p-5 rounded-2xl border border-blue-100 space-y-2"
                        >
                          <div className="flex items-center gap-2 text-blue-700 font-black text-sm">
                            <Info className="w-4 h-4" />
                            THE VERDICT
                          </div>
                          <p className="text-slate-700 text-sm leading-relaxed font-medium">{result.theVerdict}</p>
                        </motion.div>
                      </div>

                      {/* Suggestions */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Better Alternatives</h4>
                          <div className="space-y-2">
                            {result.alternatives.map((alt, i) => (
                              <div key={i} className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm font-bold text-slate-700">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {alt}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Local Smart Picks</h4>
                          <div className="space-y-2">
                            {result.localSuggestions.map((sug, i) => (
                              <div key={i} className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm font-bold text-slate-700">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                {sug}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 bg-slate-50 border-t border-slate-100 space-y-4">
                      <div className="flex items-start gap-3 bg-white p-4 rounded-xl border border-slate-200">
                        <AlertCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-500 font-medium">
                          This is a simple guide generated by AI. For serious health advice, always talk to a doctor.
                        </p>
                      </div>

                      {!recipeResult && (
                        <button
                          onClick={handleGetRecipe}
                          disabled={recipeLoading}
                          className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all"
                        >
                          {recipeLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <Utensils className="w-5 h-5" />
                          )}
                          Get a 5-Min Healthy Recipe
                        </button>
                      )}

                      {recipeResult && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm"
                        >
                          <div className="flex items-center gap-2 mb-4 text-emerald-700 font-black">
                            <Utensils className="w-5 h-5" />
                            Healthy Alternative Recipe
                          </div>
                          <div className="prose prose-emerald max-w-none text-sm markdown-body">
                            <ReactMarkdown>{recipeResult}</ReactMarkdown>
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={clearAll}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-4 rounded-2xl transition-all shadow-xl"
                  >
                    Analyze Another Item
                  </button>
                </div>
              )}

              {/* Recent Scans Mini-History */}
              {!loading && !result && recentScans.length > 0 && (
                <div className="space-y-4 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      Recent Scans
                    </h3>
                    <button 
                      onClick={() => setRecentScans([])}
                      className="text-[10px] font-black text-slate-400 hover:text-red-500 uppercase tracking-widest"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {recentScans.map((scan) => (
                      <motion.div
                        key={scan.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => {
                          setResult(scan.analysis);
                          setInput(scan.name);
                          if (scan.image) setImage(scan.image);
                        }}
                        className="flex items-center gap-4 bg-white p-3 rounded-2xl border border-slate-100 shadow-sm hover:border-emerald-500 cursor-pointer transition-all group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">
                          {scan.image ? (
                            <img src={scan.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <Apple className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-700 truncate">{scan.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {new Date(scan.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className={`px-2 py-1 rounded-lg text-[10px] font-black ${scan.score >= 70 ? 'bg-emerald-100 text-emerald-700' : scan.score >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                          {scan.score}
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ) : activeTab === 'tracker' ? (
            <motion.div 
              key="tracker-tab"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-slate-900">Daily Food Tracker</h2>
                <p className="text-slate-500 text-sm">Log what you eat to see your daily progress.</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mealInput}
                      onChange={(e) => setMealInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddMeal()}
                      placeholder="What did you eat? (e.g. 2 eggs, 1 apple)"
                      className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                    <button 
                      onClick={handleAddMeal}
                      className="bg-emerald-600 text-white p-3 rounded-xl hover:bg-emerald-700 transition-colors"
                    >
                      <Plus className="w-6 h-6" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                      <History className="w-4 h-4" />
                      Today's Meals
                    </h3>
                    {meals.length === 0 ? (
                      <div className="text-center py-12 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl space-y-3">
                        <div className="bg-white w-12 h-12 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                          <Utensils className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                          <p className="text-slate-900 font-bold">No meals logged yet</p>
                          <p className="text-slate-500 text-xs">Add your first meal to track your progress!</p>
                        </div>
                        <button 
                          onClick={() => setMealInput('2 Eggs and Toast')}
                          className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:underline"
                        >
                          Try: "2 Eggs and Toast"
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {meals.map((meal) => (
                          <div key={meal.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100 group">
                            <span className="text-slate-700 font-medium">{meal.name}</span>
                            <button 
                              onClick={() => removeMeal(meal.id)}
                              className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {meals.length > 0 && (
                    <button
                      onClick={handleCalculateTracker}
                      disabled={trackerLoading}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                    >
                      {trackerLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Checking Progress...
                        </>
                      ) : (
                        <>
                          <LayoutDashboard className="w-5 h-5" />
                          Check My Progress
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {trackerResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
                    <div className="bg-slate-900 p-6 text-white">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="font-black flex items-center gap-2">
                          <Target className="w-5 h-5 text-emerald-400" />
                          Daily Progress
                        </h3>
                        <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-black border border-emerald-500/30">
                          {trackerResult.macros.calories} kcal total
                        </span>
                      </div>

                      {/* Progress Bars */}
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-60">
                            <span>Protein</span>
                            <span>{trackerResult.macros.protein}g</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((trackerResult.macros.protein / 100) * 100, 100)}%` }}
                              className="h-full bg-emerald-500"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-60">
                            <span>Carbs</span>
                            <span>{trackerResult.macros.carbs}g</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((trackerResult.macros.carbs / 250) * 100, 100)}%` }}
                              className="h-full bg-blue-500"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-60">
                            <span>Fats</span>
                            <span>{trackerResult.macros.fats}g</span>
                          </div>
                          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min((trackerResult.macros.fats / 70) * 100, 100)}%` }}
                              className="h-full bg-amber-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                        <p className="text-emerald-900 font-bold text-sm leading-relaxed">
                          {trackerResult.summary}
                        </p>
                      </div>

                      <div className="space-y-3">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recommendations</h4>
                        <div className="space-y-2">
                          {trackerResult.recommendations.map((rec, i) => (
                            <div key={i} className="flex items-start gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                              <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                <Plus className="w-3 h-3" />
                              </div>
                              <p className="text-sm font-bold text-slate-700">{rec}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="plan-tab"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center space-y-2 mb-8">
                <h2 className="text-3xl font-bold text-slate-900">Your Health Plan</h2>
                <p className="text-slate-500 text-sm">Estimate your daily food needs in simple terms.</p>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Age</label>
                    <input
                      type="number"
                      min="1"
                      onKeyDown={handleNumberInput}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="e.g. 25"
                      className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">Weight (kg)</label>
                    <input
                      type="number"
                      min="1"
                      onKeyDown={handleNumberInput}
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="e.g. 70"
                      className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Activity Level</label>
                  <select
                    value={activity}
                    onChange={(e) => setActivity(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                  >
                    <option value="low">Low (Sitting mostly)</option>
                    <option value="moderate">Moderate (Walking/Light exercise)</option>
                    <option value="high">High (Active/Heavy exercise)</option>
                  </select>
                </div>

                <button
                  onClick={handleCalculatePlan}
                  disabled={planLoading || !age || !weight}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2"
                >
                  {planLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Calculating Plan...
                    </>
                  ) : (
                    <>
                      <Calculator className="w-5 h-5" />
                      Get My Plan
                    </>
                  )}
                </button>
              </div>

              {planResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
                >
                  <div className="bg-emerald-50 p-6 border-b border-emerald-100 flex items-center gap-2">
                    <UserCircle className="w-6 h-6 text-emerald-600" />
                    <h3 className="text-lg font-bold text-slate-900">Your Simple Health Plan</h3>
                  </div>
                  <div className="p-6 prose prose-slate max-w-none markdown-body">
                    <ReactMarkdown>{planResult}</ReactMarkdown>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Nav for Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-3 flex justify-around items-center z-20 md:hidden">
        <button 
          onClick={() => setActiveTab('analyze')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'analyze' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <Search className="w-6 h-6" />
          <span className="text-[10px] font-bold">Analyze</span>
        </button>
        <button 
          onClick={() => setActiveTab('tracker')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'tracker' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <History className="w-6 h-6" />
          <span className="text-[10px] font-bold">Tracker</span>
        </button>
        <button 
          onClick={() => setActiveTab('plan')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'plan' ? 'text-emerald-600' : 'text-slate-400'}`}
        >
          <Calculator className="w-6 h-6" />
          <span className="text-[10px] font-bold">Plan</span>
        </button>
      </nav>

      {/* Footer Desktop */}
      <footer className="mt-12 text-center text-slate-400 text-sm hidden md:block">
        <p>© 2026 Mind Your Health Assistant</p>
      </footer>
    </div>
  );
}
