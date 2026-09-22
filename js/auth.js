/**
 * Session and identity.
 *
 * Exposes flat accessors (auth.userId, auth.name, auth.key, auth.isAdmin)
 * because almost every call site wants one field, not the profile object.
 */

const auth = {
    user: null,
    profile: null,

    // Which person a shared login is being used by right now.
    seat: null,

    get userId()  { return this.user?.id || null; },
    get email()   { return this.user?.email || ''; },
    get name()    {
        if (this.seat) return personName(this.seat);
        return this.profile?.full_name || this.email || 'Unknown';
    },

    /** The people this login may act as. More than one means it is shared. */
    get seats()   { return this.profile?.seat_keys || []; },
    get isShared(){ return this.seats.length > 1; },

    /** Every key this session may own work under. */
    get keys()    {
        return this.seats.length ? this.seats : (this.profile?.member_key ? [this.profile.member_key] : []);
    },

    get role()    { return this.profile?.role || 'member'; },
    get isAdmin() { return this.role === 'admin'; },

    /** Leadership: reads the vertical, runs none of it. */
    get isLeader() { return CONFIG.leaders.includes((this.email || '').toLowerCase()); },

    /** Which set of tabs this person gets. */
    get audience() { return this.isLeader ? 'leader' : this.role; },

    /**
     * The person key used by actions.owner_name and kpis.member. On a
     * shared login this is whoever said they were signing in, so their
     * work and their attendance never land on the other person.
     */
    get key() {
        return this.seat
            || this.profile?.member_key
            || (this.profile?.full_name || '').toLowerCase().split(' ')[0]
            || null;
    },

    /**
     * Settle who is using a shared login. Remembered for the browser
     * session only: close the tab and it asks again, which is what you
     * want on a machine two people share.
     */
    async settleSeat() {
        const seats = this.seats;
        if (seats.length === 0) return;
        if (seats.length === 1) { this.seat = seats[0]; return; }

        const saved = sessionStorage.getItem('go-seat');
        if (saved && seats.includes(saved)) { this.seat = saved; return; }

        this.seat = await ui.chooseSeat(seats);
        sessionStorage.setItem('go-seat', this.seat);
    },

    /** Hand the login to the other person without signing out. */
    async switchSeat() {
        sessionStorage.removeItem('go-seat');
        this.seat = await ui.chooseSeat(this.seats);
        sessionStorage.setItem('go-seat', this.seat);
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
        this.seat = null;
        sessionStorage.removeItem('go-seat');
    }
};

/* ---------- Login page ------------------------------------- */

if (document.getElementById('login-form')) {
    const form   = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');
    const btn     = document.getElementById('login-btn');

    // Where to land after signing in: the link that brought the person here, else Today.
    const next = new URLSearchParams(location.search).get('next');
    const landing = 'dashboard.html' + (next && /^[a-z]+(\/[A-Za-z0-9-]+)?$/.test(next) ? '#' + next : '');

    sb.auth.getSession().then(({ data: { session } }) => {
        if (session) window.location.href = landing;
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
            window.location.href = landing;
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
