-- Phone Tracker Database Schema
-- PostgreSQL 15+
 
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
 
-- Main phone records table
CREATE TABLE IF NOT EXISTS phone_records (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label       VARCHAR(120),
  phone       VARCHAR(30) NOT NULL,
  country     VARCHAR(60),
  carrier     VARCHAR(80),
  line_type   VARCHAR(20) CHECK (line_type IN ('mobile','landline','voip','toll_free','unknown')),
  status      VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','flagged','blocked')),
  latitude    NUMERIC(9,6),
  longitude   NUMERIC(9,6),
  location    VARCHAR(200),
  notes       TEXT,
  tags        TEXT[],
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
 
-- Activity / event log  
CREATE TABLE IF NOT EXISTS phone_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_id    UUID NOT NULL REFERENCES phone_records(id) ON DELETE CASCADE,
  event_type  VARCHAR(40) NOT NULL,   -- 'lookup','status_change','location_update','flag','note_added'
  payload     JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
 
-- Saved searches / watchlist
CREATE TABLE IF NOT EXISTS watchlist (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(30) UNIQUE NOT NULL,
  reason      TEXT,
  alert_email VARCHAR(120),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
 
-- Indexes
CREATE INDEX idx_phone_records_phone    ON phone_records(phone);
CREATE INDEX idx_phone_records_status   ON phone_records(status);
CREATE INDEX idx_phone_records_created  ON phone_records(created_at DESC);
CREATE INDEX idx_phone_events_phone_id  ON phone_events(phone_id);
CREATE INDEX idx_phone_events_created   ON phone_events(created_at DESC);
CREATE INDEX idx_watchlist_phone        ON watchlist(phone);
 
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_phone_records_updated_at
  BEFORE UPDATE ON phone_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
 
-- Seed sample data
INSERT INTO phone_records (label, phone, country, carrier, line_type, status, location, latitude, longitude) VALUES
  ('Sales Lead - John',  '+2348012345678', 'Nigeria',  'MTN',     'mobile',   'active',   'Lagos, Nigeria',       6.5244,   3.3792),
  ('Support - Acme',     '+14155552671',   'USA',      'AT&T',    'mobile',   'active',   'San Francisco, CA',   37.7749, -122.4194),
  ('Unknown Caller',     '+447911123456',  'UK',       'Vodafone','mobile',   'flagged',  'London, UK',          51.5074,  -0.1278),
  ('Office Landline',    '+35312345678',   'Ireland',  'Eircom',  'landline', 'inactive', 'Dublin, Ireland',     53.3498,  -6.2603);
 
