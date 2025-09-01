PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE solutions (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR, 
	proposed_by VARCHAR, 
	generated_by VARCHAR(5), 
	ai_contribution_pct FLOAT, 
	ai_confidence FLOAT, 
	text TEXT, 
	normalized_text TEXT, 
	fingerprint_sha256 VARCHAR, 
	sent_for_confirmation_at DATETIME, 
	confirmed_by_user BOOLEAN, 
	confirmed_at DATETIME, 
	confirmed_ip VARCHAR, 
	confirmed_via VARCHAR(5), 
	dedup_score FLOAT, 
	published_article_id INTEGER, 
	status VARCHAR(17), 
	created_at DATETIME, 
	updated_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(published_article_id) REFERENCES kb_articles (id)
);
CREATE TABLE kb_articles (
	id INTEGER NOT NULL, 
	title VARCHAR, 
	problem_summary TEXT, 
	content_md TEXT, 
	environment_json JSON, 
	category_id INTEGER, 
	origin_ticket_id VARCHAR, 
	origin_solution_id INTEGER, 
	source VARCHAR(5), 
	ai_contribution_pct FLOAT, 
	visibility VARCHAR(8), 
	embedding_model VARCHAR, 
	embedding_hash VARCHAR, 
	faiss_id INTEGER, 
	canonical_fingerprint VARCHAR, 
	status VARCHAR(10), 
	created_at DATETIME, 
	updated_at DATETIME, 
	approved_by VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(origin_solution_id) REFERENCES solutions (id)
);
CREATE TABLE kb_audit (
	id INTEGER NOT NULL, 
	entity_type VARCHAR, 
	entity_id INTEGER, 
	event VARCHAR, 
	actor_id INTEGER, 
	meta_json JSON, 
	created_at DATETIME, 
	PRIMARY KEY (id)
);
CREATE TABLE departments (
	id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (name)
);
INSERT INTO departments VALUES(1,'ERP');
INSERT INTO departments VALUES(2,'CRM');
INSERT INTO departments VALUES(3,'SRM');
INSERT INTO departments VALUES(4,'Network');
INSERT INTO departments VALUES(5,'Security');
INSERT INTO departments VALUES(6,'General Support');
CREATE TABLE step_sequences (
	ticket_id VARCHAR NOT NULL, 
	steps JSON NOT NULL, 
	current_index INTEGER, 
	PRIMARY KEY (ticket_id)
);
CREATE TABLE kb_article_versions (
	id INTEGER NOT NULL, 
	article_id INTEGER, 
	version INTEGER, 
	content_md TEXT, 
	changelog TEXT, 
	editor_agent_id INTEGER, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	FOREIGN KEY(article_id) REFERENCES kb_articles (id)
);
CREATE TABLE kb_feedback (
	id INTEGER NOT NULL, 
	kb_article_id INTEGER, 
	user_id INTEGER, 
	user_email VARCHAR, 
	feedback_type VARCHAR(11), 
	rating INTEGER, 
	comment TEXT, 
	context_json JSON, 
	resolved_by INTEGER, 
	resolved_at DATETIME, 
	created_at DATETIME, 
	PRIMARY KEY (id), 
	CONSTRAINT ux_kb_feedback_user UNIQUE (kb_article_id, user_id), 
	FOREIGN KEY(kb_article_id) REFERENCES kb_articles (id)
);
CREATE TABLE kb_index (
	id INTEGER NOT NULL, 
	article_id INTEGER, 
	faiss_id INTEGER, 
	embedding_model VARCHAR, 
	embedding_hash VARCHAR, 
	created_at DATETIME, 
	is_active BOOLEAN, 
	PRIMARY KEY (id), 
	FOREIGN KEY(article_id) REFERENCES kb_articles (id)
);
CREATE TABLE agents (
	id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	email VARCHAR NOT NULL, 
	password VARCHAR NOT NULL, 
	role VARCHAR, 
	department_id INTEGER, 
	PRIMARY KEY (id), 
	UNIQUE (name), 
	UNIQUE (email), 
	FOREIGN KEY(department_id) REFERENCES departments (id)
);
CREATE TABLE tickets (
	id VARCHAR NOT NULL, 
	status VARCHAR NOT NULL, 
	owner VARCHAR, 
	subject VARCHAR, 
	requester_name VARCHAR, 
	category VARCHAR, 
	department_id INTEGER, 
	priority VARCHAR, 
	impact_level VARCHAR, 
	urgency_level VARCHAR, 
	requester_email VARCHAR, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	level INTEGER, 
	resolved_by INTEGER, 
	assigned_to INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(department_id) REFERENCES departments (id), 
	FOREIGN KEY(resolved_by) REFERENCES agents (id), 
	FOREIGN KEY(assigned_to) REFERENCES agents (id)
);
INSERT INTO tickets VALUES('TICKET0001','open',NULL,'connection with icon. icon dear please setup icon per icon engineers please let other details needed thanks lead',NULL,'',4,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.758071','2025-08-30T02:02:33.159054+00:00',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0002','open',NULL,'work experience user. work experience user hi work experience student coming next his name much appreciate him duration thank',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.761421','2025-08-30T02:01:14.761421',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0003','open',NULL,'requesting for meeting. requesting meeting hi please help follow equipments cable pc cord plug',NULL,'',4,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.762511','2025-08-30T02:01:14.762511',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0004','open',NULL,'reset passwords for external accounts. re expire days hi ask help update passwords colleagues thank pm expire days importance high hi received about expiration please kindly help prolongation best regards pm expire days importance high dear expire days order change please follow steps prerequisites disable device credentials close active connected by cable machine note also follow steps detailed press ctrl alt delete same pops change item enter format enter enter newly chosen then re enter again submit displaying has changed os machine browse enter format enter gear icon top tight browser window enter enter newly chosen then re enter again save connected note complete resources granted once connected by cable browse tick want change after logging enter format enter log enter enter newly chosen then re enter again change clients suppliers about expire please touch person then communicate back encounter issues hesitate by accessing yours',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.762511','2025-08-30T02:01:14.762511',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0005','open',NULL,'mail. verification warning hi has got attached please addresses best regards monitoring analyst verification warning',NULL,'',5,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.762511','2025-08-30T02:01:14.762511',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0006','open',NULL,'mail. please dear looks blacklisted receiving mails anymore sample attached thanks kind regards senior engineer',NULL,'',5,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.763618','2025-08-30T02:01:14.763618',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0007','open',NULL,'prod servers tunneling. prod tunneling va la tunneling la host si la si host host cards port name bytes bytes seq bytes seq statistics packets transmitted received packet loss avg bytes bytes seq bytes seq tuesday pm acre re tunneling si pm acre re tunneling extended object host extended host extended object host range extended host range administrator re sector pm acre re tunneling va la si la tunneling design lead ext friday pm re tunneling va extended object host extended host administrator re sector pm tunneling va la tunneling users pinging bytes bytes bytes bytes bytes design lead ext con care pot partial strict si pot ale care va la contains proprietary information which legally privileged unauthorized dissemination prohibited intended recipient views addressing transmission error has misdirected please notify author by replying intended recipient must disclose distribute copy print rely',NULL,'',4,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.763618','2025-08-30T02:01:14.763618',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0008','open',NULL,'access request. dear modules report report cost thank much regards',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.764753','2025-08-30T02:01:14.764753',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0009','open',NULL,'reset passwords for our client and. passwords client dear please passwords thank',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.765659','2025-08-30T02:01:14.765659',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0010','open',NULL,'direct reports missing time. please action reports dear way help close these maternity leave complete submit her left he technically left he client work after rd submit after delete period days two public holidays possible add thanks please action reports dear part established processes each required submit his weekly basis each friday past must submitted receiving because reports haven followed process please help cascade accordingly gets possible breakdown reports please note refers has left maternity other absence leave please update person record otherwise please person directly submit country date total days',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.765659','2025-08-30T02:01:14.765659',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0011','open',NULL,'laptop connected on request rebuild. connected rebuild hi please provide order debug sip trunk gateway wireless wired connected regards',NULL,'',4,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.766656','2025-08-30T02:01:14.766656',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0012','open',NULL,'device recovery report printer alert duplex unit is not set. device recovery report printer duplex unit printer details detected tray tray copier details detected tray scanner ready details model name device name comment host name printer name print name file name printer name zone name name computer name share name device printer printer notified',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.766656','2025-08-30T02:01:14.766656',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0013','open',NULL,'new starter. hello please fill date',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.767653','2025-08-30T02:01:14.767653',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0014','open',NULL,'visual studio license. visual studio license hello developer visual studio license thank best regards developer',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.767653','2025-08-30T02:01:14.767653',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0015','open',NULL,'system. hello movement has left available device please kind device denmark copenhagen denmark please source quotation shipping by lead',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.768649','2025-08-30T02:01:14.768649',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0016','open',NULL,'access for secondary. secondary hi please provide secondary ledger users please provide existing roles assigned these users prod test please create thank kind regards analyst',NULL,'',1,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.768649','2025-08-30T02:01:14.768649',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0017','open',NULL,'list sent copy. copy hi receive copy behavior expect receive myself thanks front developer',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.768649','2025-08-30T02:01:14.768649',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0018','open',NULL,'new purchase po. purchase po dear purchased received items lite updated include device under user name link please add allocation device thanks please log retrieve old device after receive item please take consideration mandatory receipts section order receive item ordered how video link please make return old device back accessories left receive receive old device take off user name kind regards administrator',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.768649','2025-08-30T02:01:14.768649',1,NULL,NULL);
INSERT INTO tickets VALUES('TICKET0019','open',NULL,'invitation to cloud strategy workshop february manchester. invitation strategy workshop february manchester workshop forward colleague results campaign workshop reminder content workshop reminder ca cs dad ca trouble viewing view results campaign workshop reminder content workshop reminder cs dad ca assets images azure cs dad ca azure join cs dad ca manchester discuss journey unleash benefits powered by azure workshop control optimise strategy tickets cs dad ca february discussing best working opportunities digital give tools how embrace perfect environment wednesday february where sir busby way manchester further information found control optimise strategy tickets cs dad ca please note places join workshop manchester february control optimise strategy tickets cs dad ca make february workshop interest march where street campus birmingham join workshop birmingham control optimise strategy tickets cs dad ca assets images footer cs dad ca action campaign workshop reminder content workshop reminder ca cs dad ca road bb sr',NULL,'',6,'1','4','3','priyanka@australdynamics.com','2025-08-30T02:01:14.770169','2025-08-30T02:01:14.770169',1,NULL,NULL);
CREATE TABLE messages (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR NOT NULL, 
	sender VARCHAR NOT NULL, 
	content TEXT NOT NULL, 
	timestamp DATETIME, 
	type VARCHAR, 
	meta JSON, 
	created_at VARCHAR, 
	sender_agent_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(sender_agent_id) REFERENCES agents (id)
);
INSERT INTO messages VALUES(1,'TICKET0001','user','hi','2025-08-30 02:02:33.125221','assistant',NULL,NULL,NULL);
INSERT INTO messages VALUES(2,'TICKET0001','assistant','👋 Hello! How can I assist you with your support ticket today?','2025-08-30 02:02:33.172781','assistant',NULL,NULL,NULL);
CREATE TABLE resolution_attempts (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR NOT NULL, 
	solution_id INTEGER NOT NULL, 
	attempt_no INTEGER NOT NULL, 
	sent_at DATETIME NOT NULL, 
	outcome VARCHAR(16), 
	rejected_reason VARCHAR(64), 
	rejected_detail_json TEXT, 
	closed_at DATETIME, 
	agent_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(ticket_id) REFERENCES tickets (id), 
	FOREIGN KEY(solution_id) REFERENCES solutions (id), 
	FOREIGN KEY(agent_id) REFERENCES agents (id)
);
CREATE TABLE mentions (
	id INTEGER NOT NULL, 
	message_id INTEGER NOT NULL, 
	mentioned_agent_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	UNIQUE (message_id, mentioned_agent_id), 
	FOREIGN KEY(message_id) REFERENCES messages (id) ON DELETE CASCADE, 
	FOREIGN KEY(mentioned_agent_id) REFERENCES agents (id) ON DELETE CASCADE
);
CREATE TABLE ticket_assignments (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR NOT NULL, 
	agent_id INTEGER, 
	assigned_at VARCHAR, 
	unassigned_at VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(ticket_id) REFERENCES tickets (id) ON DELETE CASCADE, 
	FOREIGN KEY(agent_id) REFERENCES agents (id) ON DELETE SET NULL
);
CREATE TABLE ticket_events (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR NOT NULL, 
	event_type VARCHAR NOT NULL, 
	actor_agent_id INTEGER, 
	details TEXT, 
	created_at VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(ticket_id) REFERENCES tickets (id) ON DELETE CASCADE, 
	FOREIGN KEY(actor_agent_id) REFERENCES agents (id)
);
CREATE TABLE ticket_cc (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR NOT NULL, 
	email VARCHAR NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT ux_ticket_cc UNIQUE (ticket_id, email), 
	FOREIGN KEY(ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
);
CREATE TABLE ticket_watchers (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR NOT NULL, 
	agent_id INTEGER, 
	PRIMARY KEY (id), 
	CONSTRAINT ux_ticket_watchers UNIQUE (ticket_id, agent_id), 
	FOREIGN KEY(ticket_id) REFERENCES tickets (id) ON DELETE CASCADE, 
	FOREIGN KEY(agent_id) REFERENCES agents (id)
);
CREATE TABLE email_queue (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR, 
	to_email VARCHAR NOT NULL, 
	cc TEXT, 
	subject VARCHAR NOT NULL, 
	body TEXT NOT NULL, 
	status VARCHAR, 
	error TEXT, 
	created_at VARCHAR, 
	sent_at VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(ticket_id) REFERENCES tickets (id) ON DELETE SET NULL
);
CREATE TABLE ticket_feedback (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR NOT NULL, 
	rating INTEGER, 
	comment TEXT, 
	submitted_at VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
);
CREATE TABLE kb_drafts (
	id INTEGER NOT NULL, 
	ticket_id VARCHAR NOT NULL, 
	title VARCHAR, 
	body TEXT, 
	status VARCHAR, 
	created_at VARCHAR, 
	updated_at VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX ix_solutions_fingerprint_sha256 ON solutions (fingerprint_sha256);
CREATE INDEX ix_solutions_status ON solutions (status);
CREATE INDEX ix_solutions_ticket_id ON solutions (ticket_id);
CREATE UNIQUE INDEX ix_kb_articles_canonical_fingerprint ON kb_articles (canonical_fingerprint);
CREATE INDEX ix_resolution_attempts_solution_id ON resolution_attempts (solution_id);
CREATE INDEX ix_resolution_attempts_outcome ON resolution_attempts (outcome);
CREATE INDEX ix_resolution_attempts_ticket_id ON resolution_attempts (ticket_id);
CREATE INDEX ix_ticket_events_ticket_created ON ticket_events (ticket_id, created_at);
CREATE INDEX ix_tickets_dept ON tickets(department_id);
CREATE INDEX ix_tickets_priority ON tickets(priority);
CREATE INDEX ix_messages_ticket_time ON messages(ticket_id, timestamp);
CREATE INDEX ix_eq_status ON email_queue(status, created_at);
CREATE INDEX ix_ra_ticket_attempt ON resolution_attempts(ticket_id, attempt_no);
CREATE INDEX ix_ra_outcome ON resolution_attempts(outcome);
COMMIT;
