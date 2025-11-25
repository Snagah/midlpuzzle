import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Loader2, CheckCircle, XCircle, Wallet, ShieldCheck, 
  LayoutGrid, RefreshCw, Trophy, Plus, Lock, Play, ArrowUpRight, 
  Menu, LogOut, ShoppingBag, Clock, Zap, Share2, Twitter, 
  HelpCircle, FileImage, Upload, Trash2, AlertTriangle, Info, Crown,
  ChevronDown, ChevronRight, Timer, ArrowRight, Star, X, User as UserIcon, 
  Camera, Edit2, ArrowUp, ArrowDown, Gift, BookOpen, PartyPopper, Key, Settings
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

// --- CONFIGURATION & CONSTANTS ---

const ADMIN_WALLET = "bc1q-midl-admin-satoshi-nakamoto"; 
const DEFAULT_ADMIN_PASSWORD = "Midl2025";
const SNAP_THRESHOLD = 40; 
const INITIAL_LOCK_DAYS = 90;
const INITIAL_LOCK_MS = INITIAL_LOCK_DAYS * 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 3600000;
const SHARE_BONUS_POINTS = 50;
const QUIZ_LOCKOUT_MS = 24 * MS_PER_HOUR;

// Firebase Init (CORRECTION TYPESCRIPT ICI)
// On utilise (window as any) pour dire à TypeScript d'ignorer l'erreur
const firebaseConfig = JSON.parse((window as any).__firebase_config || '{}');
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = (window as any).__app_id || 'midl-puzzle-v1';

// --- STYLES & FONTS ---

const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    
    body, button, input, select, textarea {
      font-family: 'Outfit', sans-serif;
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

// Icon Mapper for Market Items
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
  const days = Math.floor(diff / (1000 * 60 *
