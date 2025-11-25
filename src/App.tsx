import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Loader2, CheckCircle, XCircle, Wallet, ShieldCheck, 
  LayoutGrid, RefreshCw, Trophy, Plus, Lock, Play, ArrowUpRight, 
  Menu, LogOut, ShoppingBag, Clock, Zap, Share2, Twitter, 
  HelpCircle, FileImage, Upload, Trash2, AlertTriangle, Info, Crown,
  ChevronDown, ChevronRight, Timer, ArrowRight, Star, X, User as UserIcon, 
  Camera, Edit2, ArrowUp, ArrowDown, Gift, BookOpen, PartyPopper, Key, Settings, Link as LinkIcon
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  writeBatch,
  getDoc
} from 'firebase/firestore';

// --- TYPESCRIPT GLOBAL DECLARATIONS ---
// Ces déclarations permettent à TypeScript de reconnaître les variables injectées globalement
declare global {
  interface Window {
    __firebase_config?: string;
    __app_id?: string;
    __initial_auth_token?: string;
  }
  var __firebase_config: string | undefined;
  var __app_id: string | undefined;
  var __initial_auth_token: string | undefined;
}

// --- CONFIGURATION & CONSTANTS ---

const ADMIN_WALLET = "bc1q-midl-admin-satoshi-nakamoto"; 
const DEFAULT_ADMIN_PASSWORD = "Midl2025";
const SNAP_THRESHOLD = 40; 
const INITIAL_LOCK_DAYS = 90;
const INITIAL_LOCK_MS = INITIAL_LOCK_DAYS * 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 3600000;
const SHARE_BONUS_POINTS = 50;
const QUIZ_LOCKOUT_MS = 24 * MS_PER_HOUR;

// Firebase Init
const firebaseConfig = JSON.parse(
  typeof __firebase_config !== 'undefined' 
    ? __firebase_config!
    : (window as any).__firebase_config || '{}'
);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : (window as any).__app_id || 'default-app-id';

// --- STYLES & FONTS ---

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    
    body, button, input, select, textarea {
      font-family: 'Outfit', sans-serif;
    }
    
    body {
      margin: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.05);
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(0,0,0,0.2);
      border-radius: 10px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(0,0,0,0.4);
    }
    
    .glass-panel {
      background: rgba(255, 255, 255, 0.4);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(0,0,0,0.08);
    }
  `}</style>
);

// --- TYPES ---

type GameType = 'puzzle' | 'quiz';

type QuizAnswer = {
  id: string;
  text: string;
  isCorrect: boolean;
};

type GameConfig = {
  id: string;
  type: GameType;
  name: string;
  description?: string;
  imageUrl?: string;
  points: number;
  gridSize?: number;
  bestTime?: number; // ms
  order: number;
  quizData?: {
    question: string;
    answers: QuizAnswer[];
  };
};

type Piece = {
  id: number;
  currentX: number;
  currentY: number;
  correctX: number;
  correctY: number;
  isLocked: boolean;
  inTray: boolean;
};

type UserProfile = {
  wallet: string;
  displayName: string;
  avatarUrl?: string;
  points: number;
  lifetimePoints: number; 
  solvedPuzzles: string[];
  lockEndTime: number; 
  multiplier: number; 
  inventory: string[]; 
  failedAttempts: Record<string, number>; 
};

type MarketItem = {
  id: string;
  name: string;
  description: string;
  cost: number;
  iconKey: string;
  type: 'multiplier' | 'time_reduction' | 'special';
  value?: number;
  order: number;
};

// --- SHOP CONFIGURATION ---

const DEFAULT_MARKET_ITEMS = [
  {
    name: 'Time Warp I',
    description: 'Increase lock reduction speed by 10%.',
    cost: 200,
    type: 'multiplier',
    value: 0.1,
    iconKey: 'zap',
    order: 0
  },
  {
    name: 'Flash Loan',
    description: 'Instantly reduce lock time by 24 hours.',
    cost: 150,
    type: 'time_reduction',
    value: 24 * 3600000,
    iconKey: 'clock',
    order: 1
  },
  {
    name: 'Time Warp II',
    description: 'Increase lock reduction speed by 25%.',
    cost: 500,
    type: 'multiplier',
    value: 0.25,
    iconKey: 'zap',
    order: 2
  },
  {
    name: 'Founder 1:1',
    description: 'Exclusive 30min call with Midl founder.',
    cost: 5000,
    type: 'special',
    value: 0,
    iconKey: 'shield',
    order: 3
  }
];

// Icon Mapper
const ICON_MAP: Record<string, React.ReactNode> = {
  'zap': <Zap className="text-yellow-500" size={24} />,
  'clock': <Clock className="text-blue-500" size={24} />,
  'shield': <ShieldCheck className="text-purple-500" size={24} />,
  'trophy': <Trophy className="text-orange-500" size={24} />,
  'gift': <Gift className="text-pink-500" size={24} />,
  'star': <Star className="text-yellow-400" size={24} />
};

// --- HELPER FUNCTIONS ---

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1) + min);

const formatTimeRemaining = (endTime: number) => {
  const now = Date.now();
  const diff = endTime - now;
  if (diff <= 0) return "UNLOCKED";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${days}d ${hours.toString().padStart(2, '0')}h`;
};

const formatDuration = (ms: number) => {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
};

const generateFunName = () => {
  const adjectives = ["Cyber", "Golden", "Block", "Crypto", "Future", "Digital", "Secret", "Rapid", "Neon", "Prime"];
  const nouns = ["Satoshi", "Node", "Miner", "Hash", "Ledger", "Whale", "Oracle", "Bull", "Chain", "Protocol"];
  return `${adjectives[randomInt(0, adjectives.length - 1)]} ${nouns[randomInt(0, nouns.length - 1)]} #${randomInt(100, 999)}`;
};

const AVATAR_URLS = [
  "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=150&h=150&fit=crop&q=80", 
  "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&h=150&fit=crop&q=80", 
  "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=150&h=150&fit=crop&q=80", 
  "https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=150&h=150&fit=crop&q=80", 
  "https://images.unsplash.com/photo-1614680376408-81e91ffe3db7?w=150&h=150&fit=crop&q=80", 
  "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=150&h=150&fit=crop&q=80", 
];

// --- 5. BASIC UI COMPONENTS ---

const Tooltip = ({ children, text, className }: { children: React.ReactNode, text: string, className?: string }) => (
  <div className={`relative group flex items-center ${className}`}>
    {children}
    <div className="hidden md:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-neutral-900/95 backdrop-blur-sm text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 w-48 text-center shadow-xl border border-white/10">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900/95"></div>
    </div>
  </div>
);

const ImageDropzone = ({ 
  image, 
  setImage, 
  className 
}: { 
  image: string | undefined, 
  setImage: (val: string) => void,
  className?: string 
}) => {
  
  const processFile = (file: File) => {
    // SECURITY CHECK: Limit file size to 800KB for Firestore storage
    if (file.size > 800 * 1024) {
      window.alert("⚠️ Image trop volumineuse !\n\nDans cette démo, les images sont stockées dans la base de données et doivent faire moins de 800 Ko.\n\nConseil : Utilisez une URL d'image externe ou compressez votre fichier.");
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [setImage]);

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
       processFile(e.target.files[0]);
    }
  };

  return (
    <div 
      onDrop={onDrop}
      onDragOver={onDragOver}
      className={`relative border-2 border-dashed rounded-xl transition-colors overflow-hidden flex flex-col items-center justify-center text-center cursor-pointer ${image ? 'border-orange-200 bg-orange-50' : 'border-neutral-200 bg-neutral-50 hover:bg-neutral-100'} ${className}`}
    >
       <input 
         type="file" 
         accept="image/*" 
         onChange={handleFileSelect} 
         className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
       />
       
       {image ? (
         <div className="relative w-full h-full group">
           <img src={image} alt="Preview" className="w-full h-full object-cover" />
           <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
             <span className="text-white font-medium text-sm">Replace Image</span>
           </div>
         </div>
       ) : (
         <div className="p-6">
           <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mx-auto mb-3">
             <Upload size={18} className="text-neutral-400" />
           </div>
           <div className="text-sm font-medium text-neutral-600">Drop image here</div>
           <div className="text-xs text-neutral-400 mt-1">or click to browse</div>
         </div>
       )}
    </div>
  );
};

const LeaderboardWidget = ({ currentUserWallet }: { currentUserWallet: string }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);

  useEffect(() => {
    if (!appId) return;
    const unsub = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'profiles'), (snap) => {
      const data: UserProfile[] = [];
      snap.forEach(d => data.push({ wallet: d.id, ...d.data() } as UserProfile));
      setProfiles(data.sort((a, b) => (b.lifetimePoints || b.points) - (a.lifetimePoints || a.points)));
    }, (error) => {
        console.error("Error fetching leaderboard:", error);
    });
    return () => unsub();
  }, []);

  const top3 = profiles.slice(0, 3);
  const userRank = profiles.findIndex(p => p.wallet === currentUserWallet);
  const userInTop3 = userRank < 3;

  return (
    <div className="bg-[#F5F5F4] rounded-2xl border border-black/5 p-4 mt-4">
      <div className="flex items-center gap-2 mb-3 text-xs font-bold text-neutral-500 uppercase tracking-wider">
        <Trophy size={12} className="text-yellow-500" /> Top Solvers
      </div>
      
      <div className="space-y-2">
        {top3.map((p, idx) => (
          <div key={p.wallet} className={`flex items-center justify-between text-sm p-2 rounded-lg ${p.wallet === currentUserWallet ? 'bg-white shadow-sm' : ''}`}>
            <div className="flex items-center gap-2">
              <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold ${idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-neutral-200 text-neutral-600' : 'bg-orange-100 text-orange-700'}`}>
                {idx + 1}
              </span>
              <div className="w-5 h-5 rounded-full bg-neutral-300 overflow-hidden flex-shrink-0">
                 {p.avatarUrl ? <img src={p.avatarUrl} className="w-full h-full object-cover" alt="" /> : null}
              </div>
              <span className="font-medium text-neutral-700 truncate w-24">
                {p.displayName || `${p.wallet.substring(0, 4)}...`}
              </span>
            </div>
            <span className="font-bold text-black text-xs">{p.lifetimePoints || p.points}</span>
          </div>
        ))}

        {!userInTop3 && userRank !== -1 && (
          <>
            <div className="border-t border-neutral-200 my-1"></div>
            <div className="flex items-center justify-between text-sm p-2 rounded-lg bg-white shadow-sm border border-orange-100">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-500">
                  {userRank + 1}
                </span>
                <span className="font-medium text-black truncate w-20">You</span>
              </div>
              <span className="font-bold text-black text-xs">{profiles[userRank].lifetimePoints || profiles[userRank].points}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- HELPER COMPONENTS ---

const GuideContent = () => (
  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-5xl mt-8">
    <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl border border-white shadow-sm text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
      <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center mb-3 shadow-inner">
        <Wallet size={24} />
      </div>
      <h3 className="font-bold text-base mb-1 text-[#1A1A1A]">1. Connect</h3>
      <p className="text-xs text-neutral-500 leading-relaxed">Link your Bitcoin wallet to generate your unique identity.</p>
    </div>
    <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl border border-white shadow-sm text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200">
      <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-3 shadow-inner">
        <LayoutGrid size={24} />
      </div>
      <h3 className="font-bold text-base mb-1 text-[#1A1A1A]">2. Solve</h3>
      <p className="text-xs text-neutral-500 leading-relaxed">Complete visual puzzles and knowledge quizzes.</p>
    </div>
    <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl border border-white shadow-sm text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300">
      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center mb-3 shadow-inner">
        <Clock size={24} />
      </div>
      <h3 className="font-bold text-base mb-1 text-[#1A1A1A]">3. Earn Time</h3>
      <p className="text-xs text-neutral-500 leading-relaxed">Reduce your 90-day rewards lock with every mission success.</p>
    </div>
    <div className="bg-white/80 backdrop-blur-sm p-5 rounded-2xl border border-white shadow-sm text-center flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 delay-400">
      <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-3 shadow-inner">
        <Trophy size={24} />
      </div>
      <h3 className="font-bold text-base mb-1 text-[#1A1A1A]">4. Compete</h3>
      <p className="text-xs text-neutral-500 leading-relaxed">Earn points, climb the leaderboard, and buy boosts in the market.</p>
    </div>
  </div>
);

const GuideModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
    <div className="bg-[#F3F3F2] w-full max-w-3xl rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-white/50 to-transparent pointer-events-none"></div>
      
      <div className="flex justify-between items-center mb-8 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center"><BookOpen size={20} /></div>
          <h2 className="text-2xl font-bold text-[#1A1A1A]">Protocol Guide</h2>
        </div>
        <button onClick={onClose} className="p-2 bg-white rounded-full hover:bg-neutral-100 transition-colors shadow-sm"><X size={20} /></button>
      </div>
      
      <div className="relative z-10">
         <GuideContent />
      </div>

      <div className="mt-8 bg-white p-6 rounded-2xl border border-black/5 text-center">
         <p className="text-sm text-neutral-600 font-medium">Ready to prove your work?</p>
         <button onClick={onClose} className="mt-4 bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-neutral-800 transition-all">Start Mission</button>
      </div>
    </div>
  </div>
);

const WelcomeModal = ({ onClose }: { onClose: () => void }) => (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
    <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl relative text-center overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange-400 to-orange-600"></div>
      <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-6">
         <Gift className="text-orange-500 w-10 h-10" />
      </div>
      <h2 className="text-2xl font-bold text-[#1A1A1A] mb-2">Welcome to Midl!</h2>
      <p className="text-neutral-500 mb-8">
        You've just unlocked your identity. As a welcome bonus, we've reduced your reward lock by <strong>1 hour</strong>.
      </p>
      <button onClick={onClose} className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-neutral-800 transition-all">
        Start Earning
      </button>
    </div>
  </div>
);

// --- LIVE MISSION STATUS ---

const LiveMissionStatus = ({ 
  startTime, 
  bestTime, 
  basePoints 
}: { 
  startTime: number, 
  bestTime?: number, 
  basePoints: number 
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Calculate Dynamic Reward
  let multiplier = 1.0;
  if (!bestTime || elapsed < bestTime) {
     multiplier = 1.0;
  } else {
     multiplier = Math.max(0.1, Math.min(1.0, bestTime / elapsed));
  }
  const currentPoints = Math.floor(basePoints * multiplier);

  return (
    <div className="flex items-center gap-4 bg-black text-white px-4 py-2 rounded-full text-sm font-mono shadow-lg mb-4 animate-in fade-in slide-in-from-top-4">
       <div className="flex items-center gap-2">
          <Timer size={14} className="text-neutral-400" />
          <span>{formatDuration(elapsed)}</span>
       </div>
       <div className="w-px h-4 bg-neutral-700"></div>
       {bestTime && (
         <>
            <div className="flex items-center gap-2 text-neutral-400">
                <Crown size={14} className="text-yellow-500" />
                <span>{formatDuration(bestTime)}</span>
            </div>
            <div className="w-px h-4 bg-neutral-700"></div>
         </>
       )}
       <div className="flex items-center gap-2 text-green-400 font-bold">
          <span>+{currentPoints} PTS</span>
       </div>
    </div>
  );
};

// --- PROFILE SETTINGS ---

const ProfileSettings = ({ userProfile, onClose, wallet }: { userProfile: UserProfile, onClose: () => void, wallet: string }) => {
  const [name, setName] = useState(userProfile.displayName || '');
  const [avatar, setAvatar] = useState(userProfile.avatarUrl || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', wallet), {
        displayName: name,
        avatarUrl: avatar
      });
      onClose();
    } catch (e) {
      console.error("Profile update error", e);
    }
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-[#1A1A1A]">Edit Profile</h2>
          <button onClick={onClose} className="p-2 bg-neutral-100 rounded-full hover:bg-neutral-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col items-center">
             <div className="relative w-24 h-24 mb-4">
                <div className="w-full h-full rounded-full overflow-hidden bg-neutral-100 border-2 border-neutral-200">
                   {avatar ? (
                     <img src={avatar} alt="Profile" className="w-full h-full object-cover" />
                   ) : (
                     <div className="w-full h-full flex items-center justify-center text-neutral-400">
                       <UserIcon size={40} />
                     </div>
                   )}
                </div>
                <label className="absolute bottom-0 right-0 p-2 bg-black text-white rounded-full cursor-pointer hover:bg-neutral-800 transition-colors shadow-md">
                   <Camera size={14} />
                   <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 800 * 1024) {
                           window.alert("Image trop volumineuse (Max 800 Ko).");
                           return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => setAvatar(reader.result as string);
                        reader.readAsDataURL(file);
                      }
                   }} />
                </label>
             </div>
             <p className="text-xs text-neutral-400">Tap icon to upload</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase mb-2">Display Name</label>
            <input 
              type="text" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              className="w-full bg-[#F5F5F4] p-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-200 transition-all font-medium"
              placeholder="Enter your name"
            />
          </div>

          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-[#1A1A1A] text-white font-bold py-4 rounded-xl hover:bg-black transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSaving ? <Loader2 className="animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- LOGIN SCREENS ---

const AdminLogin = ({ onLogin, onCancel }: { onLogin: () => void, onCancel: () => void }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const docSnap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'admin', 'config'));
      const realPassword = docSnap.exists() ? docSnap.data().password : DEFAULT_ADMIN_PASSWORD; 

      if (password === realPassword) {
        onLogin();
      } else {
        setError(true);
      }
    } catch (e) {
      console.error(e);
      if (password === DEFAULT_ADMIN_PASSWORD) onLogin();
      else setError(true);
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F3F3F2] text-[#1A1A1A] flex flex-col items-center justify-center p-6">
      <div className="bg-white p-8 rounded-[32px] shadow-xl max-w-sm w-full">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center text-white mx-auto mb-4">
            <ShieldCheck size={24} />
          </div>
          <h2 className="text-2xl font-bold">Admin Access</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="Enter Password"
              className={`w-full bg-[#F5F5F4] p-3 rounded-xl outline-none border-2 transition-all ${error ? 'border-red-200' : 'border-transparent focus:border-black'}`}
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mt-2 ml-1">Incorrect password</p>}
          </div>
          
          <button type="submit" disabled={isLoading} className="w-full bg-black text-white font-bold py-3 rounded-xl hover:bg-neutral-800 transition-colors disabled:opacity-50 flex justify-center">
            {isLoading ? <Loader2 className="animate-spin" /> : 'Unlock Console'}
          </button>
          
          <button type="button" onClick={onCancel} className="w-full text-neutral-400 text-sm py-2 hover:text-black transition-colors">
            Cancel
          </button>
        </form>
      </div>
    </div>
  );
};

const WalletConnect = ({ onConnect, onAdminClick }: { onConnect: (wallet: string) => void, onAdminClick: () => void }) => {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = () => {
    setIsConnecting(true);
    setTimeout(() => {
      // Simulate Wallet Connection with random address
      const wallet = `bc1q-${Math.random().toString(36).substring(7)}-user`;
      onConnect(wallet);
      setIsConnecting(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#F3F3F2] text-[#1A1A1A] flex flex-col items-center justify-center relative overflow-hidden selection:bg-orange-200 p-6">
      <GlobalStyles />
      
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-orange-300/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-orange-200/40 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="relative z-10 w-full flex flex-col items-center">
        <div className="bg-white/60 backdrop-blur-xl p-10 rounded-[32px] border border-white shadow-2xl shadow-orange-900/5 max-w-md w-full text-center mb-8">
          {/* No Logo Here */}
          <div className="h-8"></div>
          <h1 className="text-3xl font-semibold mb-2 tracking-tight text-[#1A1A1A]">Midl Puzzles and quizzes</h1>
          <p className="text-neutral-500 mb-10 font-light text-lg">Reimagine Bitcoin.</p>

          <div className="space-y-6">
            <button 
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full bg-[#1A1A1A] hover:bg-black text-white font-medium py-4 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg hover:shadow-xl active:scale-[0.98]"
            >
              {isConnecting ? <Loader2 className="animate-spin" size={20} /> : (
                <>
                  <Wallet size={20} />
                  <span>Connect Wallet</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* How it Works Section */}
        <div className="w-full max-w-4xl">
           <div className="text-center mb-8 opacity-50 text-xs font-bold tracking-[0.2em] uppercase text-neutral-500">Game Protocol</div>
           <GuideContent />
        </div>

        {/* Admin Access - Moved to Bottom */}
        <div className="mt-12 mb-4">
          <button 
            onClick={onAdminClick}
            disabled={isConnecting}
            className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors font-medium underline underline-offset-4"
          >
            Admin Access
          </button>
        </div>
      </div>
    </div>
  );
};

// --- GAME ENGINES ---

const QuizGame = ({ 
  game, 
  onComplete,
  onFail,
  lockoutUntil
}: { 
  game: GameConfig, 
  onComplete: (duration: number) => void,
  onFail: () => void,
  lockoutUntil?: number
}) => {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const startTimeRef = useRef(Date.now());

  const isLocked = lockoutUntil && Date.now() < lockoutUntil;

  if (isLocked) {
    return (
       <div className="w-full max-w-2xl mx-auto bg-neutral-50 rounded-[32px] border border-neutral-200 p-8 md:p-12 text-center flex flex-col items-center justify-center min-h-[400px] animate-in fade-in zoom-in duration-500">
          <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6 border border-red-100">
             <Lock size={32} />
          </div>
          <h3 className="text-2xl font-semibold text-neutral-900 mb-2">Access Denied</h3>
          <p className="text-neutral-500 mb-6 max-w-md text-sm md:text-base">
            Incorrect verification attempt detected. Security protocols enforce a mandatory cooldown period.
          </p>
          <div className="bg-white px-6 py-3 rounded-full border border-neutral-200 font-mono text-sm text-neutral-600 flex items-center gap-2">
             <Clock size={14} />
             Unlocks in: {formatTimeRemaining(lockoutUntil!)}
          </div>
       </div>
    );
  }

  const handleSubmit = () => {
    if (!selectedAnswer) return;
    const answer = game.quizData?.answers.find(a => a.id === selectedAnswer);
    const correct = answer?.isCorrect || false;
    
    setIsSubmitted(true);
    
    if (correct) {
      const duration = Date.now() - startTimeRef.current;
      setTimeout(() => onComplete(duration), 1000);
    } else {
      setTimeout(onFail, 1000);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 relative flex flex-col items-center">
      
      {/* Live HUD */}
      <LiveMissionStatus startTime={startTimeRef.current} bestTime={game.bestTime} basePoints={game.points} />

      <div className="w-full bg-white rounded-[24px] md:rounded-[32px] border border-black/5 overflow-hidden shadow-sm p-6 md:p-10 relative mt-4">
         {game.description && (
           <div className="mb-8 p-6 bg-orange-50/50 rounded-2xl border border-orange-100">
              <div className="text-xs font-bold text-orange-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                <ShieldCheck size={12} /> Intelligence Report
              </div>
              <p className="text-neutral-700 leading-relaxed text-sm">{game.description}</p>
           </div>
         )}

         <h3 className="text-lg md:text-xl font-medium text-[#1A1A1A] mb-6">{game.quizData?.question}</h3>

         <div className="space-y-3">
           {game.quizData?.answers.map((answer) => {
             const isSelected = selectedAnswer === answer.id;
             let stateClass = 'border-neutral-200 hover:bg-neutral-50';
             if (isSubmitted) {
                if (isSelected) {
                    if (answer.isCorrect) {
                        stateClass = 'bg-green-50 border-green-200 text-green-700'; 
                    } else {
                        stateClass = 'bg-red-50 border-red-200 text-red-700'; 
                    }
                } else {
                    stateClass = 'opacity-50'; 
                }
             } else if (isSelected) {
                stateClass = 'bg-[#1A1A1A] text-white border-[#1A1A1A]';
             }

             return (
               <button
                 key={answer.id}
                 onClick={() => !isSubmitted && setSelectedAnswer(answer.id)}
                 disabled={isSubmitted}
                 className={`w-full p-4 text-left rounded-xl border transition-all flex justify-between items-center ${stateClass}`}
               >
                 <span className="font-medium text-sm md:text-base">{answer.text}</span>
                 {isSubmitted && isSelected && answer.isCorrect && <CheckCircle size={18} className="text-green-600" />}
                 {isSubmitted && isSelected && !answer.isCorrect && <XCircle size={18} className="text-red-600" />}
               </button>
             );
           })}
         </div>

         {!isSubmitted && (
           <div className="mt-8 flex justify-end">
             <Tooltip text="Warning: Incorrect answer will lock this quiz for 24 hours.">
                <button 
                onClick={handleSubmit}
                disabled={!selectedAnswer}
                className="bg-orange-500 hover:bg-orange-600 text-white font-medium px-8 py-3 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-orange-200 flex items-center gap-2"
                >
                Verify Answer <AlertTriangle size={14} className="opacity-70" />
                </button>
             </Tooltip>
           </div>
         )}
      </div>
    </div>
  );
};

const PuzzleGame = ({ 
  game, 
  onComplete 
}: { 
  game: GameConfig, 
  onComplete: (duration: number) => void 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [isSolved, setIsSolved] = useState(false);
  const [gridSizePx, setGridSizePx] = useState({ width: 0, height: 0 });
  const [traySizePx, setTraySizePx] = useState({ width: 0, height: 0 });
  const [draggingPiece, setDraggingPiece] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    if (!containerRef.current || !trayRef.current) return;
    
    const { clientWidth: gridW } = containerRef.current;
    // Measure tray dimensions
    const { offsetLeft: trayX, offsetTop: trayY, clientWidth: trayW, clientHeight: trayH } = trayRef.current;
    
    setGridSizePx({ width: gridW, height: gridW });
    setTraySizePx({ width: trayW, height: trayH });

    const gridSize = game.gridSize || 3;
    const pieceSize = gridW / gridSize;
    const totalPieces = gridSize * gridSize;
    const newPieces: Piece[] = [];

    for (let i = 0; i < totalPieces; i++) {
      const correctRow = Math.floor(i / gridSize);
      const correctCol = i % gridSize;
      
      newPieces.push({
        id: i,
        correctX: correctCol * pieceSize,
        correctY: correctRow * pieceSize,
        currentX: trayX + randomInt(10, trayW - pieceSize - 10),
        currentY: trayY + randomInt(10, trayH - pieceSize - 10),
        isLocked: false,
        inTray: true
      });
    }
    setPieces(newPieces);
    setIsSolved(false);
    startTimeRef.current = Date.now();
  }, [game, containerRef.current?.clientWidth, trayRef.current?.clientWidth]);

  const handlePointerDown = (e: React.PointerEvent, pieceId: number) => {
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece || piece.isLocked) return;
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingPiece(pieceId);
    
    setDragOffset({ 
        x: e.nativeEvent.offsetX,
        y: e.nativeEvent.offsetY 
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingPiece === null) return;
    
    const piece = pieces.find(p => p.id === draggingPiece);
    if(!piece) return;

    const newX = piece.inTray ? piece.currentX + e.movementX : piece.currentX + e.movementX;
    const newY = piece.inTray ? piece.currentY + e.movementY : piece.currentY + e.movementY;

    setPieces(prev => prev.map(p => {
      if (p.id !== draggingPiece) return p;
      return { ...p, currentX: newX, currentY: newY };
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (draggingPiece === null) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    
    const gridSize = game.gridSize || 3;
    const pieceSize = gridSizePx.width / gridSize;

    setPieces(prev => {
      const updated = prev.map(p => {
        if (p.id !== draggingPiece) return p;

        const gridX = containerRef.current?.offsetLeft || 0;
        const gridY = containerRef.current?.offsetTop || 0;
        const relX = p.currentX - gridX;
        const relY = p.currentY - gridY;

        if (relX >= -pieceSize/2 && relX < gridSizePx.width && relY >= -pieceSize/2 && relY < gridSizePx.height) {
            const col = Math.round(relX / pieceSize);
            const row = Math.round(relY / pieceSize);
            const snappedX = gridX + (col * pieceSize);
            const snappedY = gridY + (row * pieceSize);
            
            const absCorrectX = gridX + p.correctX;
            const absCorrectY = gridY + p.correctY;

            const dist = Math.sqrt(Math.pow(snappedX - absCorrectX, 2) + Math.pow(snappedY - absCorrectY, 2));
            
            if (dist < 10) {
                return { ...p, currentX: absCorrectX, currentY: absCorrectY, isLocked: true, inTray: false };
            }
            return { ...p, currentX: snappedX, currentY: snappedY, isLocked: false, inTray: false };
        } else {
            return p; 
        }
      });
      
      if (updated.every(p => p.isLocked)) {
          setIsSolved(true);
          const duration = Date.now() - startTimeRef.current;
          setTimeout(() => onComplete(duration), 500);
      }
      return updated;
    });
    setDraggingPiece(null);
  };

  const gridSize = game.gridSize || 3;
  const pieceSize = gridSizePx.width / gridSize;

  return (
    <div className="w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 flex flex-col items-center">
      <div className="flex justify-between items-end mb-6 w-full">
        <div>
           <h2 className="text-[#1A1A1A] font-medium text-2xl md:text-3xl">{game.name}</h2>
        </div>
      </div>
      
      {/* Live HUD */}
      <LiveMissionStatus startTime={startTimeRef.current} bestTime={game.bestTime} basePoints={game.points} />

      {game.description && (
           <div className="mb-6 p-4 bg-white/60 backdrop-blur-sm rounded-xl border border-white shadow-sm w-full">
              <p className="text-neutral-600 text-sm leading-relaxed">{game.description}</p>
           </div>
       )}

      <div className="flex flex-col md:flex-row gap-6 md:gap-8 select-none relative w-full">
        {/* Grid Container */}
        <div 
            ref={containerRef}
            className="relative w-full md:w-1/2 aspect-square bg-[#EAEAE8] rounded-2xl shadow-inner border border-black/5 overflow-hidden"
        >
            {gridSizePx.width > 0 && (
                <div 
                    className="absolute inset-0 grid pointer-events-none z-0" 
                    style={{ 
                        gridTemplateColumns: `repeat(${game.gridSize || 3}, 1fr)`,
                        gridTemplateRows: `repeat(${game.gridSize || 3}, 1fr)` 
                    }}
                >
                    {Array.from({ length: (game.gridSize || 3) ** 2 }).map((_, i) => (
                        <div key={i} className="border border-black/5 w-full h-full" />
                    ))}
                </div>
            )}
            
            {isSolved && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-md z-50 animate-in fade-in zoom-in">
                    <CheckCircle className="w-16 h-16 text-green-500 mb-2" />
                    <h3 className="font-bold text-xl">Verified</h3>
                </div>
            )}
        </div>

        {/* Tray Container */}
        <div 
            ref={trayRef}
            className="relative w-full md:w-1/2 h-64 md:h-auto bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden"
        >
            <div className="absolute top-2 left-3 text-xs font-bold text-neutral-300 uppercase tracking-wider z-0">Pieces Tray</div>
        </div>

        {/* Shared Piece Layer */}
        <div className="absolute inset-0 pointer-events-none w-full h-full z-20">
            {pieces.map(piece => {
                const gridSize = game.gridSize || 3;
                const pieceSize = gridSizePx.width / gridSize;
                
                return (
                    <div
                        key={piece.id}
                        className="touch-none"
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            (e.target as HTMLElement).setPointerCapture(e.pointerId);
                            setDraggingPiece(piece.id);
                        }}
                        onPointerMove={(e) => {
                            if (draggingPiece === piece.id) {
                                setPieces(prev => prev.map(p => {
                                    if (p.id !== draggingPiece) return p;
                                    return { ...p, currentX: p.currentX + e.movementX, currentY: p.currentY + e.movementY };
                                }));
                            }
                        }}
                        onPointerUp={(e) => {
                            if (draggingPiece === piece.id) {
                                (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                                setDraggingPiece(null);
                                
                                // Snap Logic 
                                const gridX = containerRef.current?.offsetLeft || 0;
                                const gridY = containerRef.current?.offsetTop || 0;
                                const relX = piece.currentX - gridX;
                                const relY = piece.currentY - gridY;

                                if (relX >= -pieceSize/2 && relX < gridSizePx.width && relY >= -pieceSize/2 && relY < gridSizePx.height) {
                                    const col = Math.round(relX / pieceSize);
                                    const row = Math.round(relY / pieceSize);
                                    const snappedX = gridX + (col * pieceSize);
                                    const snappedY = gridY + (row * pieceSize);
                                    
                                    const absCorrectX = gridX + piece.correctX;
                                    const absCorrectY = gridY + piece.correctY;
                                    const dist = Math.sqrt(Math.pow(snappedX - absCorrectX, 2) + Math.pow(snappedY - absCorrectY, 2));
                                    
                                    setPieces(prev => {
                                        const updated = prev.map(p => {
                                            if (p.id !== piece.id) return p;
                                            if (dist < 10) { 
                                                return { ...p, currentX: absCorrectX, currentY: absCorrectY, isLocked: true, inTray: false };
                                            }
                                            return { ...p, currentX: snappedX, currentY: snappedY, isLocked: false, inTray: false };
                                        });
                                        if (updated.every(p => p.isLocked)) {
                                            setIsSolved(true);
                                            const duration = Date.now() - startTimeRef.current;
                                            setTimeout(() => onComplete(duration), 500);
                                        }
                                        return updated;
                                    });
                                } 
                            }
                        }}
                        style={{
                            position: 'absolute',
                            width: pieceSize,
                            height: pieceSize,
                            left: piece.currentX, 
                            top: piece.currentY,
                            backgroundImage: `url(${game.imageUrl})`,
                            backgroundSize: `${gridSizePx.width}px ${gridSizePx.height}px`,
                            backgroundPosition: `-${piece.correctX}px -${piece.correctY}px`,
                            cursor: piece.isLocked ? 'default' : 'grab',
                            zIndex: piece.isLocked ? 1 : draggingPiece === piece.id ? 50 : 10,
                            boxShadow: piece.isLocked ? 'none' : '0 4px 12px rgba(0,0,0,0.2)',
                            transition: draggingPiece === piece.id ? 'none' : 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)',
                            pointerEvents: 'auto', 
                            borderRadius: piece.isLocked ? '0' : '4px',
                            border: piece.isLocked ? 'none' : '1px solid rgba(255,255,255,0.5)',
                            touchAction: 'none'
                        }}
                    />
                );
            })}
        </div>
      </div>
    </div>
  );
};

// --- DASHBOARD COMPONENTS ---

// Market component definition placed explicitly here before UserDashboard
const Market = ({ userProfile, wallet }: { userProfile: UserProfile, wallet: string }) => {
  const [items, setItems] = useState<MarketItem[]>([]);

  useEffect(() => {
    if (!appId) return;
    const unsub = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'market'), orderBy('order', 'asc')), (snap) => {
      const m: MarketItem[] = [];
      snap.forEach(d => m.push({ id: d.id, ...d.data() } as MarketItem));
      setItems(m);
    }, (error) => console.error(error));
    return () => unsub();
  }, []);

  const handlePurchase = async (item: MarketItem) => {
    if (userProfile.points < item.cost) return;
    try {
      let updates: any = {
        points: userProfile.points - item.cost,
        inventory: [...(userProfile.inventory || []), item.id]
      };
      if (item.type === 'multiplier' && item.value) {
        updates.multiplier = (userProfile.multiplier || 1.0) + item.value;
      }
      if (item.type === 'time_reduction' && item.value) {
        updates.lockEndTime = (userProfile.lockEndTime) - item.value;
      }
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', wallet), updates);
    } catch (e) { console.error("Purchase failed", e); }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-black/5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
           <h2 className="text-2xl font-medium text-[#1A1A1A] flex items-center gap-2">
             <ShoppingBag className="text-orange-500" /> The Market
           </h2>
           <div className="text-sm text-neutral-500 bg-neutral-50 px-3 py-2 rounded-xl border border-neutral-100">
                Balance: <span className="font-bold text-black">{userProfile.points} PTS</span>
           </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
             const canAfford = userProfile.points >= item.cost;
             return (
               <button 
                 key={item.id}
                 onClick={() => canAfford && handlePurchase(item)}
                 disabled={!canAfford}
                 className={`relative group text-left p-5 rounded-2xl border transition-all ${
                   canAfford 
                   ? 'bg-[#F9F9F8] border-black/5 hover:border-orange-200 hover:shadow-lg hover:shadow-orange-100' 
                   : 'bg-neutral-50 border-transparent opacity-60 cursor-not-allowed'
                 }`}
               >
                  <div className="flex justify-between items-start mb-3">
                    <div className="p-3 bg-white rounded-xl shadow-sm border border-black/5">
                      {ICON_MAP[item.iconKey] || <Zap size={24} />}
                    </div>
                    <span className={`font-bold text-sm ${canAfford ? 'text-[#1A1A1A]' : 'text-neutral-400'}`}>{item.cost} PTS</span>
                  </div>
                  <h3 className="font-semibold text-[#1A1A1A] mb-1">{item.name}</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">{item.description}</p>
                  {canAfford && (
                    <div className="absolute inset-0 bg-black/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                       <span className="bg-black text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">Purchase</span>
                    </div>
                  )}
               </button>
             );
          })}
        </div>
      </div>
    </div>
  );
};

const GameView = ({ 
  activeGame, 
  isSolved, 
  lastReward, 
  userProfile, 
  handleGameComplete, 
  handleGameFail, 
  getLockoutTime, 
  handleShare, 
  recentlyShared, 
  handleNextMission 
}: any) => {
  if (!activeGame) return null;

  // 1. SUCCESS POPUP
  if (isSolved && lastReward && lastReward.puzzleId === activeGame.id) {
    return (
      <div className="aspect-square w-full max-w-xl mx-auto bg-white rounded-3xl border border-black/5 flex flex-col items-center justify-center text-center p-8 relative overflow-hidden shadow-xl shadow-black/5 animate-in fade-in zoom-in duration-500">
        {activeGame.imageUrl ? (
           <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: `url(${activeGame.imageUrl})`, backgroundSize: 'cover', filter: 'blur(40px)' }}></div>
        ) : (
           <div className="absolute inset-0 opacity-20 pointer-events-none bg-gradient-to-br from-orange-200 to-purple-200"></div>
        )}
        <div className="relative z-10 bg-white/80 p-12 rounded-[32px] border border-white shadow-sm backdrop-blur-xl max-w-md">
            <div className="w-20 h-20 bg-orange-50 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-6 border border-orange-100"><Trophy className="w-10 h-10" /></div>
            <h2 className="text-3xl font-medium text-[#1A1A1A] mb-2">Verified</h2>
            <div className="flex flex-col gap-2 text-sm text-neutral-500 mb-8">
                <div className="flex items-center justify-center gap-2">
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><Clock size={12} /> -{1 * (userProfile?.multiplier || 1)}h Lock Reduced</span>
                  <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">+{lastReward.points} PTS</span>
                </div>
                <div className="text-xs bg-neutral-100 px-3 py-1 rounded-full mx-auto">
                  Time: {formatDuration(lastReward.time)} • Efficiency: {Math.round(lastReward.multiplier * 100)}%
                  {lastReward.isRecord && <span className="ml-2 text-yellow-600 font-bold">NEW RECORD!</span>}
                </div>
            </div>
            <div className="space-y-3">
                <button onClick={handleShare} disabled={recentlyShared} className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl font-medium transition-all ${recentlyShared ? 'bg-neutral-100 text-neutral-400 cursor-default' : 'bg-[#1A1A1A] text-white hover:bg-black shadow-lg hover:shadow-xl'}`}>{recentlyShared ? (<> <CheckCircle size={18} /> Bonus Claimed </>) : (<> <Twitter size={18} /> Share Protocol (+{SHARE_BONUS_POINTS} PTS) </>)}</button>
                <div className="flex gap-2 justify-center"><button onClick={handleNextMission} className="text-sm text-neutral-600 hover:text-black underline underline-offset-4 flex items-center gap-1">Next Mission <ArrowRight size={14} /></button></div>
            </div>
        </div>
    </div>
    );
  }

  // 2. GALLERY / COMPLETED VIEW
  if (isSolved) {
    return (
      <div className="w-full max-w-3xl mx-auto animate-in fade-in duration-700">
        <div className="bg-white p-8 rounded-2xl border border-black/5 shadow-sm">
          <div className="flex flex-col items-center justify-center text-center py-8 border-b border-black/5 mb-8">
            <div className="w-16 h-16 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-4">
              <HelpCircle size={32} />
            </div>
            <h3 className="text-xl font-medium text-black mb-2">Knowledge Verified</h3>
            <p className="text-neutral-500 max-w-md">You have successfully demonstrated your understanding of this protocol.</p>
          </div>

          {activeGame.type === 'quiz' && activeGame.quizData && (
            <div className="max-w-xl mx-auto">
              <h4 className="text-lg font-medium text-[#1A1A1A] mb-4">{activeGame.quizData.question}</h4>
              <div className="space-y-3">
                  {activeGame.quizData.answers.map((answer: any) => (
                      <div key={answer.id} className={`w-full p-4 text-left rounded-xl border flex justify-between items-center ${answer.isCorrect ? 'bg-green-50 border-green-200 text-green-700' : 'bg-neutral-50 border-transparent text-neutral-400 opacity-60'}`}>
                          <span className="font-medium text-sm md:text-base">{answer.text}</span>
                          {answer.isCorrect && <CheckCircle size={18} className="text-green-600" />}
                      </div>
                  ))}
              </div>
            </div>
          )}

          {activeGame.type === 'puzzle' && activeGame.imageUrl && (
             <div className="w-full aspect-square bg-neutral-100 rounded-2xl border border-black/5 overflow-hidden shadow-sm mt-6">
                <img src={activeGame.imageUrl} alt={activeGame.name} className="w-full h-full object-cover" />
             </div>
          )}
        </div>
      </div>
    );
  }

  return activeGame.type === 'quiz' 
    ? <QuizGame game={activeGame} onComplete={(dur) => handleGameComplete(dur)} onFail={handleGameFail} lockoutUntil={getLockoutTime(activeGame.id)} />
    : <PuzzleGame game={activeGame} onComplete={(dur) => handleGameComplete(dur)} />;
};

const UserDashboard = ({ wallet, authUser, onDisconnect }: { wallet: string, authUser: User, onDisconnect: () => void }) => {
  const [activeTab, setActiveTab] = useState<'puzzles' | 'market'>('puzzles');
  const [games, setGames] = useState<GameConfig[]>([]);
  const [activeGame, setActiveGame] = useState<GameConfig | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [recentlyShared, setRecentlyShared] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [lastReward, setLastReward] = useState<{ puzzleId: string, points: number, multiplier: number, time: number, isRecord: boolean } | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [showWelcomePopup, setShowWelcomePopup] = useState(false);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (!appId) return;
    const unsub = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'puzzles'), orderBy('order', 'asc')), (snap) => {
      const g: GameConfig[] = [];
      snap.forEach(d => g.push({ id: d.id, ...d.data() } as GameConfig));
      setGames(g);
      
      if (isFirstLoad.current && g.length > 0) {
          setActiveGame(g[0]);
          isFirstLoad.current = false;
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUser || !appId) return;
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', wallet), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        if (data.lifetimePoints === undefined) {
           data.lifetimePoints = data.points;
        }
        setUserProfile(data);
      } else {
        const futureDate = new Date();
        futureDate.setTime(Date.now() + INITIAL_LOCK_MS); 
        const bonusTime = futureDate.getTime() - MS_PER_HOUR;
        
        const newProfile: UserProfile = { 
          wallet, 
          displayName: generateFunName(),
          avatarUrl: AVATAR_URLS[Math.floor(Math.random() * AVATAR_URLS.length)],
          points: 0, lifetimePoints: 0, solvedPuzzles: [], 
          lockEndTime: bonusTime, multiplier: 1.0, inventory: [],
          failedAttempts: {}
        };
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', wallet), newProfile);
        setUserProfile(newProfile);
        setShowWelcomePopup(true); 
      }
    });
    return () => unsub();
  }, [authUser, wallet]);

  const handleGameComplete = async (duration: number) => {
    if (!activeGame || !userProfile) return;
    if (userProfile.solvedPuzzles?.includes(activeGame.id)) return;

    try {
      let multiplier = 1.0;
      let isNewRecord = false;

      if (!activeGame.bestTime || duration < activeGame.bestTime) {
        multiplier = 1.0; 
        isNewRecord = true;
      } else {
        multiplier = Math.max(0.1, Math.min(1.0, activeGame.bestTime / duration));
      }

      const earnedPoints = Math.floor(activeGame.points * multiplier);
      const reductionMs = MS_PER_HOUR * (userProfile.multiplier || 1.0);
      
      setLastReward({ puzzleId: activeGame.id, points: earnedPoints, multiplier, time: duration, isRecord: isNewRecord });

      const newLockTime = (userProfile.lockEndTime) - reductionMs;
      const newPoints = userProfile.points + earnedPoints;
      const newLifetime = (userProfile.lifetimePoints || 0) + earnedPoints;
      const newSolved = [...(userProfile.solvedPuzzles || []), activeGame.id];

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', wallet), {
        points: newPoints, 
        lifetimePoints: newLifetime,
        solvedPuzzles: newSolved, 
        lockEndTime: newLockTime
      });
      
      if (isNewRecord) {
         await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'puzzles', activeGame.id), {
            bestTime: duration
         });
      }

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'validations'), {
        wallet, 
        puzzleId: activeGame.id, 
        duration,
        points: earnedPoints,
        timestamp: serverTimestamp()
      });
      setRecentlyShared(false);
    } catch (e) { console.error("Submission Error:", e); }
  };

  const handleNextMission = () => {
    const currentIndex = games.findIndex(g => g.id === activeGame?.id);
    const nextGame = games.find((g, idx) => idx > currentIndex && !userProfile?.solvedPuzzles?.includes(g.id)) 
                  || games.find(g => !userProfile?.solvedPuzzles?.includes(g.id));
    
    if (nextGame) {
        setActiveGame(nextGame);
        setLastReward(null); 
    }
  };

  const handleGameFail = async () => {
    if (!activeGame || !userProfile) return;
    try {
      const newFailed = { ...userProfile.failedAttempts, [activeGame.id]: Date.now() };
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', wallet), {
        failedAttempts: newFailed
      });
    } catch (e) { console.error("Fail recording error", e); }
  };

  const handleShare = async () => {
    if (!activeGame || !userProfile || recentlyShared) return;
    
    let tweetText = "";
    
    if (activeGame.type === 'quiz') {
       const answersText = activeGame.quizData?.answers.map((a:any) => `- ${a.text}`).join('\n') || "";
       tweetText = `I just completed this quiz about Midl!\n\n${activeGame.description || "Knowledge Verified."}\n\nQ: ${activeGame.quizData?.question}\n${answersText}\n\nCan you answer?`;
    } else {
       tweetText = `I just completed this puzzle about Midl!`;
    }

    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`; 
    window.open(url, '_blank');

    try {
      setRecentlyShared(true);
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', wallet), {
        points: userProfile.points + SHARE_BONUS_POINTS,
        lifetimePoints: (userProfile.lifetimePoints || 0) + SHARE_BONUS_POINTS
      });
    } catch (e) { console.error("Share bonus failed", e); }
  };

  const isSolved = (pId: string) => userProfile?.solvedPuzzles?.includes(pId) ?? false;
  const getLockoutTime = (gameId: string) => {
    if (!userProfile?.failedAttempts?.[gameId]) return undefined;
    const failTime = userProfile.failedAttempts[gameId];
    if (Date.now() < failTime + QUIZ_LOCKOUT_MS) return failTime + QUIZ_LOCKOUT_MS;
    return undefined;
  };

  const activeMissions = games.filter(g => !isSolved(g.id));
  const completedMissions = games.filter(g => isSolved(g.id));

  return (
    <div className="min-h-screen bg-[#F3F3F2] text-[#1A1A1A] flex flex-col lg:flex-row overflow-hidden">
       <GlobalStyles />
       <div className="fixed top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] right-[20%] w-[600px] h-[600px] bg-orange-200/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-white rounded-full blur-[100px]" />
       </div>
       
       <div className="lg:hidden fixed top-0 left-0 w-full p-4 z-50 flex justify-between items-center bg-white/90 backdrop-blur-md border-b border-black/5 shadow-sm">
          <div className="flex items-center gap-2"><LayoutGrid size={16} className="text-black" /><span className="font-semibold">Midl.</span></div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg bg-neutral-100"><Menu size={24} /></button>
      </div>
      {mobileMenuOpen && (<div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />)}
      <aside className={`fixed inset-y-0 left-0 w-72 bg-white/80 backdrop-blur-xl border-r border-black/5 z-50 transform transition-transform duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} flex flex-col`}>
        <div className="p-6 border-b border-black/5 hidden lg:block">
           <div className="flex items-center gap-3 mb-6" onClick={() => setIsProfileOpen(true)}>
              <div className="w-10 h-10 rounded-full bg-neutral-200 overflow-hidden border-2 border-white shadow-sm cursor-pointer hover:scale-105 transition-transform">
                 {userProfile?.avatarUrl ? <img src={userProfile.avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-neutral-400"><UserIcon size={20} /></div>}
              </div>
              <div className="flex-1 cursor-pointer group">
                 <div className="font-bold text-sm text-[#1A1A1A] flex items-center gap-1">
                    {userProfile?.displayName || 'Loading...'} <Edit2 size={12} className="opacity-0 group-hover:opacity-50 transition-opacity" />
                 </div>
                 <div className="text-xs text-neutral-400">{userProfile?.points || 0} PTS</div>
              </div>
           </div>
           <div className="bg-[#F5F5F4] rounded-2xl p-4 border border-black/5">
            <div className="flex justify-between items-center mb-1">
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-medium flex items-center gap-1">Rewards Lock <Info size={10} /></div>
                <div className="flex items-center gap-1 bg-orange-100 px-1.5 py-0.5 rounded text-[10px] font-bold text-orange-600"><Zap size={10} /> {userProfile?.multiplier || 1.0}x</div>
            </div>
            <div className="text-lg font-medium text-[#1A1A1A] font-mono">{userProfile ? formatTimeRemaining(userProfile.lockEndTime) : "Calculating..."}</div>
          </div>
        </div>
        <div className="p-6 border-b border-black/5 lg:hidden mt-16">
           <div className="flex justify-between items-center mb-2"><span className="font-bold text-lg">Dashboard</span><button onClick={() => setMobileMenuOpen(false)}><X size={24} /></button></div>
           <div className="text-2xl font-bold text-[#1A1A1A] mb-2">{userProfile?.points || 0} PTS</div>
           <div className="bg-[#F5F5F4] p-3 rounded-xl text-sm font-mono">{userProfile ? formatTimeRemaining(userProfile.lockEndTime) : "--"}</div>
        </div>
        <nav className="flex-1 overflow-y-auto p-6 space-y-1">
            <button onClick={() => { setActiveTab('market'); setMobileMenuOpen(false); }} className="w-full bg-gradient-to-br from-orange-100 to-orange-50 p-4 rounded-2xl border border-orange-200 flex items-center gap-4 mb-6 hover:shadow-md transition-all group text-left">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-orange-500 shadow-sm group-hover:scale-110 transition-transform"><ShoppingBag size={24} /></div>
                <div><div className="font-bold text-orange-900">The Market</div><div className="text-xs text-orange-700 opacity-80">Spend your points</div></div>
            </button>
            <div className="px-2 mb-2 flex justify-between items-end"><span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Active Missions</span></div>
            {activeMissions.length === 0 && (<div className="px-4 py-8 text-center text-neutral-400 text-sm italic opacity-60 border border-dashed border-neutral-200 rounded-xl mb-4">No active missions.<br/>Check back later.</div>)}
            {activeMissions.map(g => {
                const lockout = getLockoutTime(g.id);
                const isActive = activeTab === 'puzzles' && activeGame?.id === g.id;
                return (
                <button key={g.id} onClick={() => { setActiveTab('puzzles'); setActiveGame(g); setLastReward(null); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group relative overflow-hidden mb-1 ${ isActive ? 'bg-black text-white shadow-lg shadow-black/10' : 'text-neutral-600 hover:bg-[#F5F5F4]' }`}>
                    <div className="w-10 h-10 rounded-lg bg-neutral-100 border border-neutral-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {lockout ? (<Lock size={16} className="text-red-400" />) : g.type === 'puzzle' ? (<img src={g.imageUrl} className="w-full h-full object-cover" alt="" />) : (<HelpCircle size={20} className="text-neutral-400" />)}
                    </div>
                    <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{g.name}</div><div className={`text-[10px] ${isActive ? 'text-neutral-400' : 'text-neutral-400'}`}>{g.points} PTS</div></div>
                </button>
                );
            })}
            {completedMissions.length > 0 && (
              <div className="pt-4 mt-2 border-t border-black/5">
                <button onClick={() => setShowCompleted(!showCompleted)} className="flex items-center gap-2 text-xs font-bold text-neutral-400 uppercase px-2 mb-2 tracking-widest hover:text-neutral-600 transition-colors w-full text-left">
                  {showCompleted ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Completed ({completedMissions.length})
                </button>
                {showCompleted && completedMissions.map(g => {
                  const isActive = activeTab === 'puzzles' && activeGame?.id === g.id;
                  return (
                    <button key={g.id} onClick={() => { setActiveTab('puzzles'); setActiveGame(g); setLastReward(null); setMobileMenuOpen(false); }} className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left group relative overflow-hidden mb-1 ${ isActive ? 'bg-[#F5F5F4] text-black' : 'text-neutral-400 hover:text-neutral-600' }`}>
                        <div className="w-10 h-10 rounded-lg bg-neutral-100 border border-neutral-200 overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                           {g.type === 'puzzle' ? (<img src={g.imageUrl} className="w-full h-full object-cover opacity-50 grayscale" alt="" />) : (<HelpCircle size={20} className="text-neutral-300" />)}
                           <div className="absolute inset-0 flex items-center justify-center bg-white/20 backdrop-blur-[1px]"><CheckCircle size={16} className="text-green-500 drop-shadow-sm" /></div>
                        </div>
                        <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{g.name}</div></div>
                    </button>
                  );
                })}
              </div>
            )}
            <LeaderboardWidget currentUserWallet={wallet} />
        </nav>
        <div className="px-6 pt-2 pb-2 border-t border-black/5">
            <button onClick={() => { setIsGuideOpen(true); setMobileMenuOpen(false); }} className="w-full flex items-center gap-3 p-3.5 rounded-xl transition-all text-left text-neutral-600 hover:bg-[#F5F5F4] hover:text-black">
                <BookOpen size={18} /><span className="font-medium text-sm">Protocol Guide</span>
            </button>
        </div>
        <div className="p-6 pt-2 flex justify-between items-center">
          <div className="flex items-center gap-3 text-neutral-500 text-sm">
             <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-orange-200 to-white border border-white shadow-sm flex-shrink-0" />
             <div className="flex flex-col overflow-hidden"><span className="text-xs text-neutral-400">Connected</span><span className="font-mono text-black truncate w-24">{wallet.substring(0, 6)}...</span></div>
          </div>
          <button onClick={onDisconnect} className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><LogOut size={18} /></button>
        </div>
      </aside>

      <main className="flex-1 p-4 lg:p-12 overflow-y-auto lg:ml-72 pt-20 lg:pt-12 z-10 relative">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'market' && userProfile && (<Market userProfile={userProfile} wallet={wallet} />)}
          {activeTab === 'puzzles' && (
            <div className="flex flex-col items-center justify-center w-full">
                <div className="w-full max-w-4xl space-y-8">
                    {games.length === 0 ? (<div className="flex items-center justify-center h-96 text-neutral-400 font-light text-lg bg-white/50 rounded-3xl border border-dashed border-neutral-200 text-center px-6"><div className="flex flex-col items-center gap-3"><div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center"><Clock className="text-neutral-300" /></div><div>No active missions detected.<br/><span className="text-sm opacity-60">The network is currently quiet.</span></div></div></div>) : (
                       <GameView 
                         activeGame={activeGame} 
                         isSolved={isSolved(activeGame?.id || '')}
                         lastReward={lastReward}
                         userProfile={userProfile}
                         handleGameComplete={handleGameComplete}
                         handleGameFail={handleGameFail}
                         getLockoutTime={getLockoutTime}
                         handleShare={handleShare}
                         recentlyShared={recentlyShared}
                         handleNextMission={handleNextMission}
                       />
                    )}
                </div>
            </div>
          )}
        </div>
      </main>
      {isProfileOpen && userProfile && (<ProfileSettings userProfile={userProfile} onClose={() => setIsProfileOpen(false)} wallet={wallet} />)}
      {isGuideOpen && (<GuideModal onClose={() => setIsGuideOpen(false)} />)}
      {showWelcomePopup && <WelcomeModal onClose={() => setShowWelcomePopup(false)} />}
    </div>
  );
};

const AdminPanel = ({ wallet, authUser, onDisconnect }: { wallet: string, authUser: any, onDisconnect: () => void }) => {
  const [activeAdminTab, setActiveAdminTab] = useState<'missions' | 'market' | 'settings'>('missions');
  const [games, setGames] = useState<GameConfig[]>([]);
  const [marketItems, setMarketItems] = useState<MarketItem[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  
  const [type, setType] = useState<GameType>('puzzle');
  const [newGame, setNewGame] = useState<Partial<GameConfig>>({ name: '', points: 100, gridSize: 3, description: '' });
  const [quizQuestion, setQuizQuestion] = useState('');
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([{ id: '1', text: '', isCorrect: false }, { id: '2', text: '', isCorrect: false }, { id: '3', text: '', isCorrect: false }]);
  
  const [newItem, setNewItem] = useState<Partial<MarketItem>>({ name: '', cost: 100, type: 'multiplier', iconKey: 'zap', value: 0.1 });

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!appId) return;
    const unsub = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'puzzles'), orderBy('order', 'asc')), (snap) => {
      const g: GameConfig[] = [];
      snap.forEach(d => g.push({ id: d.id, ...d.data() } as GameConfig));
      setGames(g);
    }, (error) => console.error(error));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!appId) return;
    const unsub = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'market'), orderBy('order', 'asc')), (snap) => {
      const m: MarketItem[] = [];
      snap.forEach(d => m.push({ id: d.id, ...d.data() } as MarketItem));
      setMarketItems(m);

      if (snap.empty) {
        const batch = writeBatch(db);
        DEFAULT_MARKET_ITEMS.forEach(item => {
          const ref = doc(collection(db, 'artifacts', appId, 'public', 'data', 'market'));
          batch.set(ref, item);
        });
        batch.commit().catch(err => console.error("Failed to seed market:", err));
      }
    }, (error) => console.error(error));
    return () => unsub();
  }, []);

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      let imgUrl = newGame.imageUrl;
      if (type === 'puzzle' && !imgUrl) {
          imgUrl = 'https://images.unsplash.com/photo-1621416894569-0f39ed31d247?q=80&w=1000&auto=format&fit=crop';
      }
      
      const gameData: any = {
        ...newGame,
        type,
        order: games.length > 0 ? Math.max(...games.map(g => g.order)) + 1 : 0,
        imageUrl: imgUrl || '', 
      };

      if (type === 'quiz') {
        const validAnswers = quizAnswers.filter(a => a.text.trim() !== '');
        if (!quizQuestion || !validAnswers.some(a => a.isCorrect)) {
           window.alert("Quiz needs a question and at least one correct answer among valid inputs.");
           setIsSubmitting(false);
           return;
        }
        gameData.quizData = { question: quizQuestion, answers: validAnswers };
      }

      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'puzzles'), gameData);
      setNewGame({ name: '', points: 100, gridSize: 3, description: '', imageUrl: '' });
      setQuizQuestion('');
      setQuizAnswers([{ id: '1', text: '', isCorrect: false }, { id: '2', text: '', isCorrect: false }, { id: '3', text: '', isCorrect: false }]);
    } catch (err) { console.error(err); }
    setIsSubmitting(false);
  };

  const handleDeleteGame = async (id: string) => {
    if (window.confirm('Delete this mission?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'puzzles', id));
  };

  const moveGame = async (idx: number, dir: -1 | 1) => {
    if (idx + dir < 0 || idx + dir >= games.length) return;
    const current = games[idx];
    const swap = games[idx + dir];
    const batch = writeBatch(db);
    batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'puzzles', current.id), { order: swap.order });
    batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'puzzles', swap.id), { order: current.order });
    await batch.commit();
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const itemData: any = {
        ...newItem,
        order: marketItems.length > 0 ? Math.max(...marketItems.map(i => i.order)) + 1 : 0,
      };
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'market'), itemData);
      setNewItem({ name: '', cost: 100, type: 'multiplier', iconKey: 'zap', value: 0.1 });
    } catch (err) { console.error(err); }
    setIsSubmitting(false);
  };

  const handleDeleteItem = async (id: string) => {
    if (window.confirm('Delete this item?')) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'market', id));
  };

  const moveItem = async (idx: number, dir: -1 | 1) => {
    if (idx + dir < 0 || idx + dir >= marketItems.length) return;
    const current = marketItems[idx];
    const swap = marketItems[idx + dir];
    const batch = writeBatch(db);
    batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'market', current.id), { order: swap.order });
    batch.update(doc(db, 'artifacts', appId, 'public', 'data', 'market', swap.id), { order: current.order });
    await batch.commit();
  };
  
  const handleUpdatePassword = async () => {
    if (!newPassword) return;
    setIsSubmitting(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'admin', 'config'), { password: newPassword });
      setPasswordStatus('Password updated successfully');
      setNewPassword('');
    } catch (e) {
      setPasswordStatus('Error updating password');
    }
    setIsSubmitting(false);
    setTimeout(() => setPasswordStatus(''), 3000);
  };

  const updateAnswer = (idx: number, field: keyof QuizAnswer, val: any) => {
    const newAnswers = [...quizAnswers];
    if (field === 'isCorrect') {
       newAnswers.forEach(a => a.isCorrect = false);
       newAnswers[idx].isCorrect = val;
    } else { (newAnswers[idx] as any)[field] = val; }
    setQuizAnswers(newAnswers);
  };
  const addAnswer = () => { if (quizAnswers.length < 5) setQuizAnswers([...quizAnswers, { id: Math.random().toString(), text: '', isCorrect: false }]); };

  return (
    <div className="min-h-screen bg-[#F3F3F2] text-[#1A1A1A] p-6 font-sans">
      <GlobalStyles />
      <header className="max-w-6xl mx-auto mb-8 flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-black/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center"><ShieldCheck size={20} /></div>
          <div><h1 className="text-xl font-bold">Admin Console</h1><div className="text-xs text-neutral-400 font-mono mt-0.5">Logged in</div></div>
        </div>
        <div className="flex gap-4">
            <button onClick={() => setActiveAdminTab('missions')} className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeAdminTab === 'missions' ? 'bg-black text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>Missions</button>
            <button onClick={() => setActiveAdminTab('market')} className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeAdminTab === 'market' ? 'bg-black text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>Market</button>
            <button onClick={() => setActiveAdminTab('settings')} className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeAdminTab === 'settings' ? 'bg-black text-white' : 'text-neutral-500 hover:bg-neutral-100'}`}>Settings</button>
            <button onClick={onDisconnect} className="bg-neutral-100 hover:bg-red-50 hover:text-red-600 text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"><LogOut size={16} /> Log Out</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {activeAdminTab === 'missions' && (
            <>
            <div className="bg-white border border-black/5 rounded-3xl p-8 shadow-sm">
                <h2 className="font-bold text-lg mb-6 flex items-center gap-2"><Plus className="w-5 h-5 text-orange-500" /> New Mission</h2>
                <div className="flex p-1 bg-neutral-100 rounded-xl mb-6">
                    <button onClick={() => setType('puzzle')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${type === 'puzzle' ? 'bg-white text-black shadow-sm' : 'text-neutral-500'}`}>Puzzle</button>
                    <button onClick={() => setType('quiz')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${type === 'quiz' ? 'bg-white text-black shadow-sm' : 'text-neutral-500'}`}>Quiz</button>
                </div>
                <form onSubmit={handleCreateGame} className="space-y-5">
                    <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Name</label><input required type="text" value={newGame.name} onChange={e => setNewGame({...newGame, name: e.target.value})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" /></div>
                    <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Description</label><textarea required value={newGame.description} onChange={e => setNewGame({...newGame, description: e.target.value})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none h-20" /></div>
                    {type === 'puzzle' && (
                        <>
                        <div>
                          <label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Image</label>
                          <div className="space-y-3">
                            <ImageDropzone image={newGame.imageUrl} setImage={(val) => setNewGame({...newGame, imageUrl: val})} />
                            
                            <div className="flex items-center gap-2">
                               <div className="h-px bg-neutral-200 flex-1"></div>
                               <span className="text-xs text-neutral-400 font-medium">OR USE URL</span>
                               <div className="h-px bg-neutral-200 flex-1"></div>
                            </div>

                            <div className="flex gap-2">
                               <div className="bg-neutral-100 p-3 rounded-xl text-neutral-500"><LinkIcon size={18} /></div>
                               <input 
                                 type="text" 
                                 placeholder="Paste image URL here (e.g. https://images.unsplash.com/...)" 
                                 value={newGame.imageUrl && newGame.imageUrl.startsWith('http') ? newGame.imageUrl : ''}
                                 onChange={(e) => setNewGame({...newGame, imageUrl: e.target.value})}
                                 className="flex-1 bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" 
                               />
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Points</label><input type="number" value={newGame.points} onChange={e => setNewGame({...newGame, points: parseInt(e.target.value)})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" /></div>
                            <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Grid</label><select value={newGame.gridSize} onChange={e => setNewGame({...newGame, gridSize: parseInt(e.target.value)})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none"><option value={3}>3x3</option><option value={4}>4x4</option><option value={5}>5x5</option><option value={6}>6x6</option><option value={7}>7x7</option></select></div>
                        </div>
                        </>
                    )}
                    {type === 'quiz' && (
                        <>
                        <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Question</label><input required type="text" value={quizQuestion} onChange={e => setQuizQuestion(e.target.value)} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" /></div>
                        <div className="space-y-2">{quizAnswers.map((a, i) => (<div key={i} className="flex items-center gap-2"><input type="radio" checked={a.isCorrect} onChange={() => updateAnswer(i, 'isCorrect', true)} /><input value={a.text} onChange={(e) => updateAnswer(i, 'text', e.target.value)} className="flex-1 bg-[#F5F5F4] rounded-lg p-2 text-sm" placeholder={`Answer ${i+1}`} /></div>))}</div>
                        <button type="button" onClick={addAnswer} className="text-xs text-orange-500">+ Add Answer</button>
                        <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Points</label><input type="number" value={newGame.points} onChange={e => setNewGame({...newGame, points: parseInt(e.target.value)})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" /></div>
                        </>
                    )}
                    <button type="submit" disabled={isSubmitting} className="w-full bg-black text-white font-medium py-3 rounded-xl flex justify-center">{isSubmitting ? <Loader2 className="animate-spin" /> : "Create Mission"}</button>
                </form>
            </div>
            <div className="lg:col-span-2 bg-white border border-black/5 rounded-3xl p-8 shadow-sm">
                <h2 className="font-bold text-lg mb-6">Active Missions (Ordered)</h2>
                <div className="space-y-2">
                    {games.map((g, idx) => (
                        <div key={g.id} className="flex items-center gap-4 bg-[#F9F9F8] p-3 rounded-xl border border-black/5">
                            <div className="flex flex-col gap-1">
                                <button onClick={() => moveGame(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-white rounded disabled:opacity-30"><ArrowUp size={14} /></button>
                                <button onClick={() => moveGame(idx, 1)} disabled={idx === games.length - 1} className="p-1 hover:bg-white rounded disabled:opacity-30"><ArrowDown size={14} /></button>
                            </div>
                            <div className="w-10 h-10 bg-white rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-black/5">
                                {g.type === 'quiz' ? <HelpCircle size={20} className="text-neutral-400" /> : <img src={g.imageUrl} className="w-full h-full object-cover" />}
                            </div>
                            <div className="flex-1 font-medium text-sm">{g.name}</div>
                            <button onClick={() => handleDeleteGame(g.id)} className="text-neutral-400 hover:text-red-500"><Trash2 size={16} /></button>
                        </div>
                    ))}
                </div>
            </div>
            </>
        )}
        
        {activeAdminTab === 'market' && (
            <>
            <div className="bg-white border border-black/5 rounded-3xl p-8 shadow-sm">
                <h2 className="font-bold text-lg mb-6 flex items-center gap-2"><Plus className="w-5 h-5 text-orange-500" /> New Item</h2>
                <form onSubmit={handleCreateItem} className="space-y-5">
                    <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Name</label><input required value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" /></div>
                    <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Description</label><textarea required value={newItem.description} onChange={e => setNewItem({...newItem, description: e.target.value})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none h-20" /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Cost</label><input type="number" value={newItem.cost} onChange={e => setNewItem({...newItem, cost: parseInt(e.target.value)})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" /></div>
                        <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Type</label><select value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value as any})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none"><option value="multiplier">Multiplier</option><option value="time_reduction">Time Reduction</option><option value="special">Special</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Value (e.g. 0.1)</label><input type="number" step="0.01" value={newItem.value} onChange={e => setNewItem({...newItem, value: parseFloat(e.target.value)})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" /></div>
                        <div><label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Icon Key</label><select value={newItem.iconKey} onChange={e => setNewItem({...newItem, iconKey: e.target.value})} className="w-full bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none"><option value="zap">Zap</option><option value="clock">Clock</option><option value="shield">Shield</option><option value="trophy">Trophy</option><option value="gift">Gift</option><option value="star">Star</option></select></div>
                    </div>
                    <button type="submit" disabled={isSubmitting} className="w-full bg-black text-white font-medium py-3 rounded-xl flex justify-center">{isSubmitting ? <Loader2 className="animate-spin" /> : "Create Item"}</button>
                </form>
            </div>
            <div className="lg:col-span-2 bg-white border border-black/5 rounded-3xl p-8 shadow-sm">
                <h2 className="font-bold text-lg mb-6">Market Items</h2>
                <div className="space-y-2">
                    {marketItems.map((item, idx) => (
                        <div key={item.id} className="flex items-center gap-4 bg-[#F9F9F8] p-3 rounded-xl border border-black/5">
                            <div className="flex flex-col gap-1">
                                <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="p-1 hover:bg-white rounded disabled:opacity-30"><ArrowUp size={14} /></button>
                                <button onClick={() => moveItem(idx, 1)} disabled={idx === marketItems.length - 1} className="p-1 hover:bg-white rounded disabled:opacity-30"><ArrowDown size={14} /></button>
                            </div>
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-black/5">
                                {ICON_MAP[item.iconKey]}
                            </div>
                            <div className="flex-1">
                                <div className="font-medium text-sm">{item.name}</div>
                                <div className="text-xs text-neutral-500">{item.cost} PTS</div>
                            </div>
                            <button onClick={() => handleDeleteItem(item.id)} className="text-neutral-400 hover:text-red-500"><Trash2 size={16} /></button>
                        </div>
                    ))}
                </div>
            </div>
            </>
        )}
        
        {activeAdminTab === 'settings' && (
           <div className="col-span-1 lg:col-span-3 bg-white border border-black/5 rounded-3xl p-8 shadow-sm">
               <h2 className="font-bold text-lg mb-6 flex items-center gap-2"><Settings className="w-5 h-5 text-neutral-500" /> Security Settings</h2>
               <div className="max-w-md">
                  <div className="mb-6">
                    <label className="block text-xs text-neutral-500 mb-1.5 uppercase font-semibold">Update Admin Password</label>
                    <div className="flex gap-3">
                       <input 
                         type="password" 
                         value={newPassword} 
                         onChange={e => setNewPassword(e.target.value)} 
                         className="flex-1 bg-[#F5F5F4] rounded-xl p-3 text-sm outline-none" 
                         placeholder="New password..."
                       />
                       <button 
                         onClick={handleUpdatePassword} 
                         disabled={isSubmitting || !newPassword} 
                         className="bg-black text-white px-6 rounded-xl font-medium text-sm hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                       >
                          {isSubmitting ? <Loader2 className="animate-spin w-4 h-4" /> : <Key size={16} />} Update
                       </button>
                    </div>
                    {passwordStatus && <p className="text-xs text-green-600 mt-2 font-medium">{passwordStatus}</p>}
                  </div>
                  
                  <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl text-sm text-orange-800">
                     <strong>Note:</strong> The default password is "Midl2025". Once updated here, the new password will be required for all future admin logins.
                  </div>
               </div>
           </div>
        )}
      </main>
    </div>
  );
};

const App = () => {
  const [wallet, setWallet] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [view, setView] = useState<'connect' | 'admin_login' | 'dashboard' | 'admin_panel'>('connect');

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (user) => { setAuthUser(user); });
  }, []);

  const handleDisconnect = () => { 
    setWallet(null);
    setView('connect');
  };

  const handleUserConnect = (w: string) => {
    setWallet(w);
    setView('dashboard');
  };

  const handleAdminLogin = () => {
    setWallet(ADMIN_WALLET);
    setView('admin_panel');
  };

  if (view === 'admin_login') {
    return <AdminLogin onLogin={handleAdminLogin} onCancel={() => setView('connect')} />;
  }

  if (view === 'dashboard' && wallet) {
    return <UserDashboard wallet={wallet} authUser={authUser!} onDisconnect={handleDisconnect} />;
  }

  if (view === 'admin_panel' && wallet === ADMIN_WALLET) {
    return <AdminPanel wallet={wallet} authUser={authUser} onDisconnect={handleDisconnect} />;
  }

  return <WalletConnect onConnect={handleUserConnect} onAdminClick={() => setView('admin_login')} />;
};

export default App;
