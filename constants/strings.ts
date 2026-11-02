// Play Store link for the app (used in share sheets / cards). Update the id if
// the package is renamed (e.g. com.lootboard.app).
export const APP_STORE_URL = 'https://play.google.com/store/apps/details?id=com.familywin.app';

// iOS App Store link — TEMPLATED. No Apple listing yet; set this when the app
// ships on iOS and the share cards will start advertising both stores.
export const IOS_STORE_URL = '';

// Short human label shown on share-card footers (kept store-neutral until iOS
// exists). Swap to "Google Play & App Store" once IOS_STORE_URL is set.
export const STORE_TAGLINE = 'Free on Google Play';

// Where feedback and support emails go (Help & Legal, the review prompt).
export const SUPPORT_EMAIL = 'sameerrajwade@gmail.com';

/** The best available store link for text-share fallbacks. */
export const bestStoreUrl = (): string => APP_STORE_URL || IOS_STORE_URL;

export const Strings = {
  app: {
    name: 'Chore League',
    tagline: 'Your family\'s weekly showdown.',
  },

  auth: {
    login: 'Log In',
    register: 'Create Account',
    logout: 'Log Out',
    email: 'Email',
    password: 'Password',
    forgotPassword: 'Forgot password?',
    noAccount: "Don't have an account?",
    hasAccount: 'Already have an account?',
    signUp: 'Sign Up',
    signIn: 'Sign In',
  },

  family: {
    createFamily: 'Create Family',
    joinFamily: 'Join Family',
    familyName: 'Family Name',
    inviteCode: 'Invite Code',
    yourName: 'Your Name',
    yourAge: 'Your Age (optional)',
    role: 'Role',
    parent: 'Parent',
    child: 'Child',
    adminParent: 'Admin Parent',
    copied: 'Invite code copied!',
    inviteMembers: 'Invite Members',
  },

  tasks: {
    title: 'Tasks',
    todaysTasks: "Today's Tasks",
    createTask: 'Create Task',
    editTask: 'Edit Task',
    taskTitle: 'Task Title',
    taskDescription: 'Description (optional)',
    category: 'Category',
    difficulty: 'Difficulty',
    recurrence: 'Repeats',
    assignTo: 'Assign To',
    anyone: 'Anyone',
    pointValue: 'Points',
    autoFailHour: 'Auto-fail at',
    markDone: 'Mark Done',
    completed: 'Completed ✓',
    failed: 'Missed',
    noTasksToday: 'No tasks for today! 🎉',
    allDone: 'All done for today! 🏆',
  },

  points: {
    points: 'pts',
    earned: 'earned',
    lost: 'lost',
    thisWeek: 'This Week',
    allTime: 'All Time',
    history: 'Point History',
  },

  leaderboard: {
    title: 'Leaderboard',
    weeklyStandings: 'Weekly Standings',
    rank: 'Rank',
    winner: 'Winner! 🏆',
    noMembers: 'No members yet',
  },

  discipline: {
    title: 'Discipline',
    logEvent: 'Log Event',
    selectMember: 'Select Member',
    reason: 'Reason',
    pointChange: 'Point Change',
    note: 'Note (optional)',
    penalty: 'Penalty',
    bonus: 'Bonus',
    logDiscipline: 'Log Discipline',
  },

  rewards: {
    title: 'Rewards',
    store: 'Rewards Store',
    createReward: 'Create Reward',
    redeem: 'Redeem',
    pointCost: 'Point Cost',
    pending: 'Pending',
    approved: 'Approved ✓',
    rejected: 'Rejected',
    notEnoughPoints: "You don't have enough points",
    redeemed: 'Redeemed!',
  },

  notifications: {
    dailyReminderTitle: 'Quick check-in ✅',
    dailyReminderBody: "Tick off what's done and bank today's points.",
    weeklyWinnerTitle: '🏆 Weekly Results Are In!',
    streakTitle: '🔥 Keep your streak going!',
    missedTasksTitle: '⚠️ Missed tasks alert',
  },

  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    confirm: 'Confirm',
    back: 'Back',
    next: 'Next',
    done: 'Done',
    loading: 'Loading...',
    error: 'Something went wrong',
    retry: 'Retry',
    noData: 'No data yet',
    comingSoon: 'Coming Soon',
    settings: 'Settings',
    profile: 'Profile',
    history: 'History',
  },

  errors: {
    required: 'This field is required',
    invalidEmail: 'Invalid email address',
    passwordTooShort: 'Password must be at least 6 characters',
    invalidInviteCode: 'Invalid invite code',
    networkError: 'Network error. Please try again.',
    authError: 'Authentication failed. Please try again.',
  },
} as const;
