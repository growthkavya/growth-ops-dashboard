// Authentication + profile loading.
const auth = {
  user: null,
  profile: null,
  hasReportees: false,  // does this user supervise any Growth Lab interns?

  async init() {
    const { data: { session } } = await getSupabase().auth.getSession();
    if (session) {
      this.user = session.user;
      await this.loadProfile();
      await this.checkSupervisor();
    }
    return this.user;
  },

  async checkSupervisor() {
    if (!this.user) { this.hasReportees = false; return false; }
    try {
      const { count, error } = await getSupabase()
        .from('interns')
        .select('id', { count: 'exact', head: true })
        .eq('supervisor_id', this.user.id)
        .contains('tags', ['growth_lab'])
        .eq('status', 'active');
      if (error) throw error;
      this.hasReportees = (count || 0) > 0;
    } catch (e) {
      console.debug('checkSupervisor failed:', e.message);
      this.hasReportees = false;
    }
    return this.hasReportees;
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
    await this.checkSupervisor();
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
