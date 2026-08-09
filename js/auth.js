/**
 * Session and identity.
 *
 * Exposes flat accessors (auth.userId, auth.name, auth.key, auth.isAdmin)
 * because almost every call site wants one field, not the profile object.
 */

const auth = {
    user: null,
    profile: null,

    get userId()  { return this.user?.id || null; },
    get email()   { return this.user?.email || ''; },
    get name()    { return this.profile?.full_name || this.email || 'Unknown'; },
    get role()    { return this.profile?.role || 'member'; },
    get isAdmin() { return this.role === 'admin'; },

    /** The person key used by actions.owner_name and kpis.member. */
    get key() {
        return this.profile?.member_key
            || (this.profile?.full_name || '').toLowerCase().split(' ')[0]
            || null;
    },

    async init() {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return false;
        this.user = session.user;

        const { data: profile, error } = await sb
            .from('profiles').select('*').eq('id', this.user.id).single();
        if (error) console.error('Could not load profile:', error.message);
        this.profile = profile || null;
        return true;
    },

    async signIn(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        this.user = data.user;
        return data;
    },

    async signUp(email, password, fullName) {
        const { data, error } = await sb.auth.signUp({
            email, password,
            options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        return data;
    },

    async signOut() {
        await sb.auth.signOut();
        this.user = null;
        this.profile = null;
    }
};

/* ---------- Login page ------------------------------------- */

if (document.getElementById('login-form')) {
    const form   = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');
    const btn     = document.getElementById('login-btn');

    sb.auth.getSession().then(({ data: { session } }) => {
        if (session) window.location.href = 'dashboard.html';
    });

    const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        btn.disabled = true;
        btn.textContent = 'Signing in…';

        try {
            await auth.signIn(
                document.getElementById('email').value,
                document.getElementById('password').value
            );
            window.location.href = 'dashboard.html';
        } catch (err) {
            // Supabase returns the same message for a wrong password and an
            // unknown address, so say what to do rather than guessing which.
            showError(
                /invalid/i.test(err.message || '')
                    ? 'That email and password don\'t match. Check both, or ask Kavya to reset it.'
                    : err.message || 'Could not sign in. Try again.'
            );
            btn.disabled = false;
            btn.textContent = 'Sign in';
        }
    });

    const signupModal = document.getElementById('signup-modal');
    const signupForm  = document.getElementById('signup-form');
    const signupError = document.getElementById('signup-error');

    document.getElementById('signup-link')?.addEventListener('click', (e) => {
        e.preventDefault();
        signupModal.style.display = 'flex';
    });

    document.getElementById('close-signup')?.addEventListener('click', () => {
        signupModal.style.display = 'none';
    });

    signupModal?.addEventListener('click', (e) => {
        if (e.target === signupModal) signupModal.style.display = 'none';
    });

    signupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        signupError.style.display = 'none';
        try {
            const { user, session } = await auth.signUp(
                document.getElementById('signup-email').value,
                document.getElementById('signup-password').value,
                document.getElementById('signup-name').value
            );
            if (session) {
                window.location.href = 'dashboard.html';
            } else if (user) {
                signupModal.style.display = 'none';
                alert('Account created. Check your email for the confirmation link, then sign in.');
            }
        } catch (err) {
            signupError.textContent = err.message || 'Could not create the account.';
            signupError.style.display = 'block';
        }
    });
}
