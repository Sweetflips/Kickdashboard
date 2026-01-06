/**
 * PHASE 2: Create Platform Tables in Shuttle (DB1)
 * 
 * This script creates all tables needed from Mainline (DB2) in Shuttle (DB1):
 * - platform_users (renamed from DB2's users)
 * - All related tables from DB2
 * 
 * Run: node scripts/database-merge/phase2-create-platform-tables.js
 */

const { Client } = require('pg');

const DB1_URL = 'postgresql://postgres:TGlahexkFWDUIbBOxJKxmTyPPvnSdrIj@shuttle.proxy.rlwy.net:41247/railway';

async function phase2() {
  const client = new Client({ connectionString: DB1_URL });
  
  try {
    await client.connect();
    console.log('✅ Connected to Shuttle (DB1) database\n');
    
    await client.query('BEGIN');
    
    // Step 1: Create platform_users table (from Mainline's users)
    console.log('📋 Step 1: Creating platform_users table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_users (
        id BIGSERIAL PRIMARY KEY,
        kick_user_id BIGINT UNIQUE NOT NULL,
        username TEXT NOT NULL,
        email TEXT,
        email_verified_at TIMESTAMP,
        bio TEXT,
        profile_picture_url TEXT,
        custom_profile_picture_url TEXT,
        
        -- Authentication tokens
        access_token_hash TEXT,
        refresh_token_hash TEXT,
        access_token_encrypted TEXT,
        refresh_token_encrypted TEXT,
        
        -- Settings
        notifications_enabled BOOLEAN DEFAULT true,
        email_notifications_enabled BOOLEAN DEFAULT false,
        chat_font_size TEXT DEFAULT '14px',
        chat_show_timestamps BOOLEAN DEFAULT true,
        
        -- Login tracking
        last_login_at TIMESTAMP,
        last_ip_address TEXT,
        last_user_agent TEXT,
        
        -- Signup tracking
        signup_ip_address TEXT,
        signup_user_agent TEXT,
        signup_referrer TEXT,
        
        -- Social URLs for duplicate detection
        instagram_url TEXT,
        twitter_url TEXT,
        
        -- Connected Accounts: Discord
        discord_user_id TEXT,
        discord_username TEXT,
        discord_access_token_hash TEXT,
        discord_connected BOOLEAN DEFAULT false,
        
        -- Connected Accounts: Telegram
        telegram_user_id TEXT,
        telegram_username TEXT,
        telegram_access_token_hash TEXT,
        telegram_connected BOOLEAN DEFAULT false,
        
        -- Connected Accounts: Twitter
        twitter_user_id TEXT,
        twitter_username TEXT,
        twitter_access_token_hash TEXT,
        twitter_connected BOOLEAN DEFAULT false,
        
        -- Connected Accounts: Instagram
        instagram_user_id TEXT,
        instagram_username TEXT,
        instagram_access_token_hash TEXT,
        instagram_connected BOOLEAN DEFAULT false,
        
        -- Connected Accounts: Razed
        razed_user_id TEXT,
        razed_username TEXT,
        razed_connected BOOLEAN DEFAULT false,
        
        -- Flags
        kick_connected BOOLEAN DEFAULT true,
        is_admin BOOLEAN DEFAULT false,
        is_excluded BOOLEAN DEFAULT false,
        moderator_override BOOLEAN,
        
        -- Timestamps
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('   ✅ platform_users table created');
    
    // Create indexes for platform_users
    console.log('   Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_users_kick_user_id ON platform_users(kick_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_users_username ON platform_users(username)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_users_razed_username ON platform_users(razed_username)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_users_discord_user_id ON platform_users(discord_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_users_telegram_user_id ON platform_users(telegram_user_id)');
    console.log('   ✅ Indexes created');
    
    // Step 2: Create platform_user_sweet_coins table
    console.log('\n📋 Step 2: Creating platform_user_sweet_coins table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_user_sweet_coins (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT UNIQUE NOT NULL,
        total_sweet_coins INTEGER DEFAULT 0,
        total_emotes INTEGER DEFAULT 0,
        last_sweet_coin_earned_at TIMESTAMP,
        is_subscriber BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_user_sweet_coins_user 
          FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✅ platform_user_sweet_coins table created');
    
    // Step 3: Create platform_sweet_coin_history table
    console.log('\n📋 Step 3: Creating platform_sweet_coin_history table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_sweet_coin_history (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        stream_session_id BIGINT,
        sweet_coins_earned INTEGER DEFAULT 1,
        message_id TEXT UNIQUE,
        earned_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_sweet_coin_history_user 
          FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_sweet_coin_history_user_id ON platform_sweet_coin_history(user_id, earned_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_sweet_coin_history_stream ON platform_sweet_coin_history(stream_session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_sweet_coin_history_earned_at ON platform_sweet_coin_history(earned_at)');
    console.log('   ✅ platform_sweet_coin_history table created');
    
    // Step 4: Create platform_stream_sessions table
    console.log('\n📋 Step 4: Creating platform_stream_sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_stream_sessions (
        id BIGSERIAL PRIMARY KEY,
        broadcaster_user_id BIGINT NOT NULL,
        channel_slug TEXT NOT NULL,
        kick_stream_id TEXT,
        session_title TEXT,
        thumbnail_url TEXT,
        thumbnail_captured_at TIMESTAMP,
        thumbnail_last_refreshed_at TIMESTAMP,
        thumbnail_source TEXT,
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP,
        last_live_check_at TIMESTAMP,
        peak_viewer_count INTEGER DEFAULT 0,
        total_messages INTEGER DEFAULT 0,
        duration_seconds INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_stream_sessions_broadcaster ON platform_stream_sessions(broadcaster_user_id, ended_at)');
    console.log('   ✅ platform_stream_sessions table created');
    
    // Step 5: Create platform_chat_messages table
    console.log('\n📋 Step 5: Creating platform_chat_messages table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_chat_messages (
        id BIGSERIAL PRIMARY KEY,
        message_id TEXT UNIQUE NOT NULL,
        stream_session_id BIGINT,
        sender_user_id BIGINT NOT NULL,
        sender_username TEXT NOT NULL,
        broadcaster_user_id BIGINT NOT NULL,
        content TEXT NOT NULL,
        emotes JSONB,
        has_emotes BOOLEAN DEFAULT false,
        engagement_type TEXT DEFAULT 'regular',
        message_length INTEGER DEFAULT 0,
        exclamation_count INTEGER DEFAULT 0,
        sentence_count INTEGER DEFAULT 0,
        timestamp BIGINT NOT NULL,
        sender_username_color TEXT,
        sender_badges JSONB,
        sender_is_verified BOOLEAN DEFAULT false,
        sender_is_anonymous BOOLEAN DEFAULT false,
        sweet_coins_earned INTEGER DEFAULT 0,
        sweet_coins_reason TEXT,
        sent_when_offline BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_chat_messages_stream 
          FOREIGN KEY (stream_session_id) REFERENCES platform_stream_sessions(id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_chat_messages_stream_offline ON platform_chat_messages(stream_session_id, sent_when_offline)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_chat_messages_sender ON platform_chat_messages(sender_user_id, stream_session_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_chat_messages_broadcaster ON platform_chat_messages(broadcaster_user_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_chat_messages_emotes ON platform_chat_messages(has_emotes)');
    console.log('   ✅ platform_chat_messages table created');
    
    // Step 6: Create platform_offline_chat_messages table
    console.log('\n📋 Step 6: Creating platform_offline_chat_messages table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_offline_chat_messages (
        id BIGSERIAL PRIMARY KEY,
        message_id TEXT UNIQUE NOT NULL,
        sender_user_id BIGINT NOT NULL,
        sender_username TEXT NOT NULL,
        broadcaster_user_id BIGINT NOT NULL,
        content TEXT NOT NULL,
        emotes JSONB,
        has_emotes BOOLEAN DEFAULT false,
        engagement_type TEXT DEFAULT 'regular',
        message_length INTEGER DEFAULT 0,
        exclamation_count INTEGER DEFAULT 0,
        sentence_count INTEGER DEFAULT 0,
        timestamp BIGINT NOT NULL,
        sender_username_color TEXT,
        sender_badges JSONB,
        sender_is_verified BOOLEAN DEFAULT false,
        sender_is_anonymous BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('   ✅ platform_offline_chat_messages table created');
    
    // Step 7: Create platform_user_sessions table
    console.log('\n📋 Step 7: Creating platform_user_sessions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_user_sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        session_id TEXT UNIQUE NOT NULL,
        region TEXT,
        country TEXT,
        client_type TEXT,
        user_agent TEXT,
        ip_hash TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        last_seen_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_user_sessions_user 
          FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_user_sessions_user ON platform_user_sessions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_user_sessions_last_seen ON platform_user_sessions(last_seen_at)');
    console.log('   ✅ platform_user_sessions table created');
    
    // Step 8: Create platform_raffles table
    console.log('\n📋 Step 8: Creating platform_raffles table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_raffles (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'general',
        prize_description TEXT NOT NULL,
        ticket_cost INTEGER NOT NULL,
        max_tickets_per_user INTEGER,
        total_tickets_cap INTEGER,
        start_at TIMESTAMP NOT NULL,
        end_at TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'upcoming',
        sub_only BOOLEAN DEFAULT false,
        hidden_until_start BOOLEAN DEFAULT false,
        hidden BOOLEAN DEFAULT false,
        draw_seed TEXT,
        number_of_winners INTEGER DEFAULT 1,
        rigging_enabled BOOLEAN DEFAULT false,
        wheel_background_url TEXT,
        center_logo_url TEXT,
        slice_opacity FLOAT DEFAULT 0.5,
        drawn_at TIMESTAMP,
        claim_message TEXT,
        created_by BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_raffles_creator 
          FOREIGN KEY (created_by) REFERENCES platform_users(id)
      )
    `);
    console.log('   ✅ platform_raffles table created');
    
    // Step 9: Create platform_raffle_entries table
    console.log('\n📋 Step 9: Creating platform_raffle_entries table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_raffle_entries (
        id BIGSERIAL PRIMARY KEY,
        raffle_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        tickets INTEGER DEFAULT 1,
        source TEXT DEFAULT 'system',
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_raffle_entries_raffle 
          FOREIGN KEY (raffle_id) REFERENCES platform_raffles(id) ON DELETE CASCADE,
        CONSTRAINT fk_platform_raffle_entries_user 
          FOREIGN KEY (user_id) REFERENCES platform_users(id),
        UNIQUE (raffle_id, user_id)
      )
    `);
    console.log('   ✅ platform_raffle_entries table created');
    
    // Step 10: Create platform_raffle_winners table
    console.log('\n📋 Step 10: Creating platform_raffle_winners table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_raffle_winners (
        id BIGSERIAL PRIMARY KEY,
        raffle_id BIGINT NOT NULL,
        entry_id BIGINT NOT NULL,
        selected_at TIMESTAMP DEFAULT NOW(),
        selected_ticket_index BIGINT,
        spin_number INTEGER,
        is_rigged BOOLEAN DEFAULT false,
        CONSTRAINT fk_platform_raffle_winners_raffle 
          FOREIGN KEY (raffle_id) REFERENCES platform_raffles(id) ON DELETE CASCADE,
        CONSTRAINT fk_platform_raffle_winners_entry 
          FOREIGN KEY (entry_id) REFERENCES platform_raffle_entries(id) ON DELETE CASCADE
      )
    `);
    console.log('   ✅ platform_raffle_winners table created');
    
    // Step 11: Create platform_promo_codes table
    console.log('\n📋 Step 11: Creating platform_promo_codes table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_promo_codes (
        id BIGSERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        sweet_coins_value INTEGER NOT NULL,
        max_uses INTEGER,
        current_uses INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        created_by BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_promo_codes_creator 
          FOREIGN KEY (created_by) REFERENCES platform_users(id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_promo_codes_code ON platform_promo_codes(code)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_promo_codes_expires ON platform_promo_codes(expires_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_promo_codes_active ON platform_promo_codes(is_active)');
    console.log('   ✅ platform_promo_codes table created');
    
    // Step 12: Create platform_promo_code_redemptions table
    console.log('\n📋 Step 12: Creating platform_promo_code_redemptions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_promo_code_redemptions (
        id BIGSERIAL PRIMARY KEY,
        promo_code_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        sweet_coins_awarded INTEGER NOT NULL,
        redeemed_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_promo_redemptions_code 
          FOREIGN KEY (promo_code_id) REFERENCES platform_promo_codes(id) ON DELETE CASCADE,
        CONSTRAINT fk_platform_promo_redemptions_user 
          FOREIGN KEY (user_id) REFERENCES platform_users(id),
        UNIQUE (promo_code_id, user_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_promo_redemptions_user ON platform_promo_code_redemptions(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_promo_redemptions_redeemed ON platform_promo_code_redemptions(redeemed_at)');
    console.log('   ✅ platform_promo_code_redemptions table created');
    
    // Step 13: Create platform_purchase_transactions table
    console.log('\n📋 Step 13: Creating platform_purchase_transactions table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_purchase_transactions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        sweet_coins_spent INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        advent_item_id TEXT,
        raffle_id BIGINT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_purchase_transactions_user 
          FOREIGN KEY (user_id) REFERENCES platform_users(id) ON DELETE CASCADE
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_purchase_transactions_user ON platform_purchase_transactions(user_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_purchase_transactions_type ON platform_purchase_transactions(type, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_purchase_transactions_raffle ON platform_purchase_transactions(raffle_id)');
    console.log('   ✅ platform_purchase_transactions table created');
    
    // Step 14: Create platform_advent_purchases table
    console.log('\n📋 Step 14: Creating platform_advent_purchases table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_advent_purchases (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        item_id TEXT NOT NULL,
        tickets INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_advent_purchases_user 
          FOREIGN KEY (user_id) REFERENCES platform_users(id),
        UNIQUE (user_id, item_id)
      )
    `);
    console.log('   ✅ platform_advent_purchases table created');
    
    // Step 15: Create platform_referrals table
    console.log('\n📋 Step 15: Creating platform_referrals table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_referrals (
        id BIGSERIAL PRIMARY KEY,
        referrer_user_id BIGINT NOT NULL,
        referee_user_id BIGINT UNIQUE NOT NULL,
        referral_code TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_referrals_referrer 
          FOREIGN KEY (referrer_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
        CONSTRAINT fk_platform_referrals_referee 
          FOREIGN KEY (referee_user_id) REFERENCES platform_users(id) ON DELETE CASCADE
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_referrals_referrer ON platform_referrals(referrer_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_referrals_code ON platform_referrals(referral_code)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_referrals_created ON platform_referrals(created_at)');
    console.log('   ✅ platform_referrals table created');
    
    // Step 16: Create platform_referral_rewards table
    console.log('\n📋 Step 16: Creating platform_referral_rewards table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_referral_rewards (
        id BIGSERIAL PRIMARY KEY,
        referrer_user_id BIGINT NOT NULL,
        referee_user_id BIGINT NOT NULL,
        tier_id TEXT NOT NULL,
        required_sweet_coins INTEGER NOT NULL,
        reward_sweet_coins INTEGER NOT NULL,
        awarded_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_platform_referral_rewards_referrer 
          FOREIGN KEY (referrer_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
        UNIQUE (referrer_user_id, referee_user_id, tier_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_referral_rewards_referrer ON platform_referral_rewards(referrer_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_referral_rewards_awarded ON platform_referral_rewards(awarded_at)');
    console.log('   ✅ platform_referral_rewards table created');
    
    // Step 17: Create platform_razed_verifications table
    console.log('\n📋 Step 17: Creating platform_razed_verifications table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_razed_verifications (
        id BIGSERIAL PRIMARY KEY,
        kick_user_id BIGINT NOT NULL,
        razed_username TEXT NOT NULL,
        verification_code TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'pending',
        verified_at TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_razed_verifications_code ON platform_razed_verifications(verification_code)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_razed_verifications_status ON platform_razed_verifications(status, expires_at)');
    console.log('   ✅ platform_razed_verifications table created');
    
    // Step 18: Create platform_app_settings table
    console.log('\n📋 Step 18: Creating platform_app_settings table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('   ✅ platform_app_settings table created');
    
    // Step 19: Create platform_chat_jobs table (for queue)
    console.log('\n📋 Step 19: Creating platform_chat_jobs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_chat_jobs (
        id BIGSERIAL PRIMARY KEY,
        message_id TEXT UNIQUE NOT NULL,
        payload JSONB NOT NULL,
        sender_user_id BIGINT NOT NULL,
        broadcaster_user_id BIGINT NOT NULL,
        stream_session_id BIGINT,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        locked_at TIMESTAMP,
        processed_at TIMESTAMP,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_chat_jobs_status ON platform_chat_jobs(status, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_chat_jobs_locked ON platform_chat_jobs(status, locked_at)');
    console.log('   ✅ platform_chat_jobs table created');
    
    // Step 20: Create platform_sweet_coin_award_jobs table
    console.log('\n📋 Step 20: Creating platform_sweet_coin_award_jobs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_sweet_coin_award_jobs (
        id BIGSERIAL PRIMARY KEY,
        kick_user_id BIGINT NOT NULL,
        stream_session_id BIGINT,
        message_id TEXT UNIQUE NOT NULL,
        badges JSONB,
        emotes JSONB,
        status TEXT DEFAULT 'pending',
        attempts INTEGER DEFAULT 0,
        locked_at TIMESTAMP,
        processed_at TIMESTAMP,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_sweet_coin_award_jobs_status ON platform_sweet_coin_award_jobs(status, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_sweet_coin_award_jobs_locked ON platform_sweet_coin_award_jobs(status, locked_at)');
    console.log('   ✅ platform_sweet_coin_award_jobs table created');
    
    // Step 21: Create platform_moderation_action_logs table
    console.log('\n📋 Step 21: Creating platform_moderation_action_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_moderation_action_logs (
        id BIGSERIAL PRIMARY KEY,
        broadcaster_user_id BIGINT NOT NULL,
        target_user_id BIGINT NOT NULL,
        target_username TEXT NOT NULL,
        action_type TEXT NOT NULL,
        duration_seconds INTEGER,
        reason TEXT,
        rule_id TEXT,
        ai_flagged BOOLEAN DEFAULT false,
        ai_categories JSONB,
        ai_max_score FLOAT,
        message_content TEXT,
        message_id TEXT,
        raid_mode_active BOOLEAN DEFAULT false,
        dry_run BOOLEAN DEFAULT false,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_mod_logs_broadcaster ON platform_moderation_action_logs(broadcaster_user_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_mod_logs_target ON platform_moderation_action_logs(target_user_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_mod_logs_action ON platform_moderation_action_logs(action_type, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_mod_logs_rule ON platform_moderation_action_logs(rule_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_mod_logs_ai ON platform_moderation_action_logs(ai_flagged, created_at)');
    console.log('   ✅ platform_moderation_action_logs table created');
    
    // Step 22: Create platform_bot_reply_logs table
    console.log('\n📋 Step 22: Creating platform_bot_reply_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS platform_bot_reply_logs (
        id BIGSERIAL PRIMARY KEY,
        broadcaster_user_id BIGINT NOT NULL,
        trigger_user_id BIGINT NOT NULL,
        trigger_username TEXT NOT NULL,
        trigger_message TEXT NOT NULL,
        reply_content TEXT NOT NULL,
        reply_type TEXT NOT NULL,
        ai_model TEXT,
        success BOOLEAN DEFAULT true,
        error_message TEXT,
        latency_ms INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_bot_reply_broadcaster ON platform_bot_reply_logs(broadcaster_user_id, created_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_platform_bot_reply_type ON platform_bot_reply_logs(reply_type, created_at)');
    console.log('   ✅ platform_bot_reply_logs table created');
    
    // Step 23: Create player_casino_links table (NEW - for linking users to casino accounts)
    console.log('\n📋 Step 23: Creating player_casino_links table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS player_casino_links (
        id BIGSERIAL PRIMARY KEY,
        platform_user_id BIGINT NOT NULL,
        casino TEXT NOT NULL,
        casino_user_id TEXT NOT NULL,
        casino_username TEXT,
        verified BOOLEAN DEFAULT false,
        verified_at TIMESTAMP,
        total_wagered DECIMAL(20, 8) DEFAULT 0,
        last_wager_sync_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_player_casino_links_user 
          FOREIGN KEY (platform_user_id) REFERENCES platform_users(id) ON DELETE CASCADE,
        UNIQUE (platform_user_id, casino),
        UNIQUE (casino, casino_user_id)
      )
    `);
    await client.query('CREATE INDEX IF NOT EXISTS idx_player_casino_links_user ON player_casino_links(platform_user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_player_casino_links_casino ON player_casino_links(casino, casino_user_id)');
    console.log('   ✅ player_casino_links table created');
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ PHASE 2 COMPLETE: All platform tables created');
    console.log('='.repeat(60));
    console.log('\nTables created:');
    console.log('  - platform_users');
    console.log('  - platform_user_sweet_coins');
    console.log('  - platform_sweet_coin_history');
    console.log('  - platform_stream_sessions');
    console.log('  - platform_chat_messages');
    console.log('  - platform_offline_chat_messages');
    console.log('  - platform_user_sessions');
    console.log('  - platform_raffles');
    console.log('  - platform_raffle_entries');
    console.log('  - platform_raffle_winners');
    console.log('  - platform_promo_codes');
    console.log('  - platform_promo_code_redemptions');
    console.log('  - platform_purchase_transactions');
    console.log('  - platform_advent_purchases');
    console.log('  - platform_referrals');
    console.log('  - platform_referral_rewards');
    console.log('  - platform_razed_verifications');
    console.log('  - platform_app_settings');
    console.log('  - platform_chat_jobs');
    console.log('  - platform_sweet_coin_award_jobs');
    console.log('  - platform_moderation_action_logs');
    console.log('  - platform_bot_reply_logs');
    console.log('  - player_casino_links (NEW)');
    console.log('\nNext step: Run phase3-migrate-data.js');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error during Phase 2:', error.message);
    console.error('Transaction rolled back. No changes were made.');
    throw error;
  } finally {
    await client.end();
  }
}

// Run the phase
phase2().catch(err => {
  console.error(err);
  process.exit(1);
});



