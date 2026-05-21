// Authentication + profile loading.
const auth = {
  user: null,
  profile: null,

  async init() {
    const { data: { session } } = await getSupabase().auth.getSession();
    if (session) {
      this.user = session.user;
      await this.loadProfile();
    }
    return this.user;
  },

  async loadProfile() {
    if (!this.user) return null;
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('*')
      .eq('id', this.user.id)
      .single();
    if (error) {
      console.error('profile load error', error);
      return null;
    }
    this.profile = data;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    this.user = data.user;
    await this.loadProfile();
    return data;
  },

  async signOut() {
    await getSupabase().auth.signOut();
    this.user = null;
    this.profile = null;
    localStorage.removeItem('gl_selected_intern_id');
    localStorage.removeItem('gl_selected_intern_name');
  },

  // Derived role buckets for routing
  role() {
    if (!this.profile) return null;
    return this.profile.role; // 'admin' | 'member' | 'intern'
  },
  isSuper()  { return this.role() === 'admin'; }, // Vidyut + Kavya
  isRM()     { return this.role() === 'member'; },
  isIntern() { return this.role() === 'intern'; },
};
