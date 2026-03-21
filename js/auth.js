/**
 * Authentication Module
 */

const auth = {
    currentUser: null,
    currentProfile: null,

    // Initialize auth state
    async init() {
        // Check for existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            this.currentUser = session.user;
            await this.loadProfile();
            return true;
        }
        return false;
    },

    // Load user profile from database
    async loadProfile() {
        if (!this.currentUser) return null;
        try {
            this.currentProfile = await db.getProfile(this.currentUser.id);
            return this.currentProfile;
        } catch (error) {
            console.error('Failed to load profile:', error);
            return null;
        }
    },

    // Sign in with email and password
    async signIn(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        this.currentUser = data.user;
        await this.loadProfile();
        return data;
    },

    // Sign up new user
    async signUp(email, password, fullName) {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName
                }
            }
        });

        if (error) throw error;

        // Note: Supabase may require email confirmation
        // The profile will be created automatically by the database trigger
        return data;
    },

    // Sign out
    async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        this.currentUser = null;
        this.currentProfile = null;
        realtime.unsubscribeAll();
    },

    // Get current user
    getUser() {
        return this.currentUser;
    },

    // Get current profile
    getProfile() {
        return this.currentProfile;
    },

    // Check if user is admin
    isAdmin() {
        return this.currentProfile?.role === 'admin';
    },

    // Listen for auth state changes
    onAuthStateChange(callback) {
        return supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                this.currentUser = session.user;
                this.loadProfile().then(() => callback(event, session));
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.currentProfile = null;
                callback(event, session);
            } else {
                callback(event, session);
            }
        });
    }
};

// Login page specific code
if (document.getElementById('login-form')) {
    const loginForm = document.getElementById('login-form');
    const signupModal = document.getElementById('signup-modal');
    const signupForm = document.getElementById('signup-form');
    const signupLink = document.getElementById('signup-link');
    const closeSignup = document.getElementById('close-signup');
    const loginError = document.getElementById('login-error');
    const signupError = document.getElementById('signup-error');

    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            window.location.href = 'index.html';
        }
    });

    // Login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('login-btn');

        btn.querySelector('.btn-text').style.display = 'none';
        btn.querySelector('.btn-loading').style.display = 'inline';
        loginError.style.display = 'none';

        try {
            await auth.signIn(email, password);
            window.location.href = 'index.html';
        } catch (error) {
            loginError.textContent = error.message || 'Invalid email or password';
            loginError.style.display = 'block';
            btn.querySelector('.btn-text').style.display = 'inline';
            btn.querySelector('.btn-loading').style.display = 'none';
        }
    });

    // Show signup modal
    signupLink.addEventListener('click', (e) => {
        e.preventDefault();
        signupModal.style.display = 'flex';
    });

    // Close signup modal
    closeSignup.addEventListener('click', () => {
        signupModal.style.display = 'none';
    });

    // Close modal on outside click
    signupModal.addEventListener('click', (e) => {
        if (e.target === signupModal) {
            signupModal.style.display = 'none';
        }
    });

    // Signup form submission
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;

        signupError.style.display = 'none';

        try {
            const { data } = await auth.signUp(email, password, name);

            if (data.user && !data.session) {
                // Email confirmation required
                signupModal.style.display = 'none';
                alert('Check your email for a confirmation link!');
            } else if (data.session) {
                // Auto-confirmed, redirect
                window.location.href = 'index.html';
            }
        } catch (error) {
            signupError.textContent = error.message || 'Failed to create account';
            signupError.style.display = 'block';
        }
    });
}
