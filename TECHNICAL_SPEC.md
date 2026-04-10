# NomosX — Technical Specification

> ✅ This document describes only what is currently implemented and tested.
> For product vision and roadmap, see [PRODUCT_VISION.md](./PRODUCT_VISION.md)

---

## 🏗️ **Architecture Overview**

### **Core Components**

#### **1. Pipeline V2 - Unified Intelligence Engine**
- **File**: `lib/agent/pipeline-v2.ts`
- **Function**: `runPipelineCore(query, opts)` - Single implementation for brief/strategic modes
- **Steps**: 16-step unified pipeline (SCOUT → INDEX → EMBED → DEDUPLICATE → RANK → READER → ANALYST → COUNCIL → GUARD → EDITOR → VERIFIER → CRITICAL LOOP → DEBATE → META-ANALYSIS → DEVIL'S ADVOCATE → PUBLISHER → KNOWLEDGE GRAPH)
- **Performance**: <30s (brief), <60s (strategic)

#### **2. 22 Domain Expert System**
- **File**: `lib/agent/phd-researcher.ts`
- **Experts**: 22 domain-specialized analysts with verifiable expertise
- **Domains**: economics, technology, policy, health, security, law, environment, quantitative, finance, social-sciences, humanities, energy-advanced, geopolitics, cognitive-science, digital-society, behavioral-economics, urban-studies, development-economics, computational-social-science, bioethics, complexity-science, risk-analysis
- **Selection**: Intelligent domain detection with keyword scoring
- **Execution**: Parallel analysis with memory injection

#### **3. Provider Network (66+)**
- **File**: `lib/providers/openalex-provider-factory.js`
- **Coverage**: Academic institutions, think tanks, journals, government agencies
- **Technology**: OpenAlex API with ROR IDs, Source IDs, Concept IDs
- **Quality**: Real-time provider health tracking and circuit breaker

#### **4. Knowledge Graph**
- **File**: `lib/agent/knowledge-graph.ts`
- **Structure**: ConceptNode + ConceptRelation (Prisma models)
- **Features**: Longitudinal tracking, contradiction detection, semantic relationships

---

## 📊 **Data Architecture**

### **Database Schema (Prisma)**
```prisma
model Brief {
  id          String   @id @default(cuid())
  query       String
  html        String
  sources     Json
  sections    String[]
  qualityScore Json?
  createdAt   DateTime @default(now())
  
  @@index([createdAt(sort: Desc)])
  @@index([query])
}

model ConceptNode {
  id           String   @id
  name         String
  domain       String
  definition   String
  embeddings   Json?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  relations    ConceptRelation[]
}

model ConceptRelation {
  id             String @id @default(cuid())
  fromConceptId  String
  toConceptId    String
  relationType   String
  strength       Float
  source         String
  createdAt      DateTime @default(now())
  
  fromConcept    ConceptNode @relation(fields: [fromConceptId], references: [id])
  toConcept      ConceptNode @relation(fields: [toConceptId], references: [id])
}

model AgentAuditLog {
  id          String   @id @default(cuid())
  agentId     String
  action      String
  result      Json
  costUsd     Float
  durationMs  Int
  timestamp   DateTime @default(now())
  
  @@index([agentId])
  @@index([timestamp])
}
```

### **Cache Layer (Redis)**
- **SCOUT results**: TTL 24h
- **Embeddings**: Persistent storage
- **Rate limiting**: INCR+EXPIRE atomic operations
- **Session data**: User-specific pipeline state

---

## 🔧 **API Architecture**

### **Core Endpoints**
```
/api/v3/analysis          - Main analysis endpoint
/api/brief/auto            - Quick brief generation
/api/council/ask           - Expert council queries
/api/council/stream        - SSE streaming analysis
/api/pipeline              - Pipeline status and control
/api/knowledge/graph       - Knowledge graph queries
/api/providers/search      - Provider search interface
```

### **Security Features**
- **Authentication**: JWT-based with 32-character minimum secret
- **Rate Limiting**: Redis-backed with per-user limits
- **CSRF Protection**: Origin/referer validation for mutations
- **Input Validation**: Zod schemas on all endpoints
- **Error Sanitization**: No stack traces in production

---

## 🚀 **Performance Characteristics**

### **Pipeline Performance**
```typescript
// Target metrics (95th percentile)
├── Context Primer: <2s
├── SCOUT: <5s (parallel providers)
├── INDEX: <8s (ROR/ORCID enrichment)
├── RANK: <3s (quality scoring)
├── READER: <10s (PDF processing)
├── ANALYST: <15s (multi-pass synthesis)
├── COUNCIL: <20s (22 experts parallel)
├── CRITICAL LOOP: <5s
├── DEBATE: <10s
├── PUBLISHER: <3s
└── Total: <30s (brief), <60s (strategic)
```

### **Scalability**
- **Concurrent Users**: 1000+ (Redis connection pooling)
- **Pipeline Throughput**: 20+ concurrent analyses
- **Provider API**: 10 req/s with polite pooling
- **Database**: Neon PostgreSQL with pgbouncer (20 max connections)

---

## 🛡️ **Security & Reliability**

### **Security Measures**
- **Zero-trust architecture**: All endpoints protected except health/stats
- **Secrets Management**: Environment variables only, no hardcoded keys
- **Input Sanitization**: XSS protection, SQL injection prevention
- **Rate Limiting**: Multi-tier (user, IP, global)
- **Audit Trail**: Complete agent action logging

### **Reliability Features**
- **Circuit Breaker**: Provider health tracking with auto-recovery
- **Graceful Degradation**: Fallback providers when primary fail
- **Memory Management**: Automatic cleanup and garbage collection
- **Error Recovery**: Retry logic with exponential backoff

---

## 📈 **Monitoring & Observability**

### **Health Checks**
```typescript
GET /api/health
{
  "status": "healthy",
  "database": "connected",
  "redis": "connected", 
  "openai": "available",
  "timestamp": "2026-02-23T10:00:00Z",
  "version": "2.0.0"
}
```

### **Metrics Tracked**
- **Pipeline Performance**: Step-by-step timing
- **Agent Performance**: Success rates, costs, accuracy
- **Provider Health**: Uptime, response times, error rates
- **User Analytics**: Query patterns, success rates, feedback

---

## 🔌 **Integration Points**

### **External APIs**
- **OpenAI**: GPT-4o for analysis (primary)
- **OpenAlex**: Academic source discovery
- **Redis**: Caching and rate limiting
- **Neon**: PostgreSQL database
- **Sentry**: Error tracking and monitoring

### **Internal Services**
- **MCP Agents**: 360+ functions via `mcp-agents-index.ts`
- **Knowledge Graph**: Concept relationship tracking
- **Alpha Intelligence**: Real-time signal detection
- **Omega Verification**: 5-layer fact checking

---

## 🧪 **Testing Coverage**

### **Test Suites**
- **Unit Tests**: Core agent functions (`__tests__/agents/`)
- **Integration Tests**: Full pipeline (`__tests__/integration/`)
- **API Tests**: Security and functionality (`__tests__/api/`)
- **Performance Tests**: Load testing and benchmarks

### **Test Commands**
```bash
npm run test              # Unit tests
npm run test:integration   # Integration tests
npm run test:coverage     # Coverage report
npm run test:system        # End-to-end system tests
```

---

## 📝 **Development Workflow**

### **Local Development**
```bash
npm install
npm run dev                # Start development server
npm run db:push            # Initialize database
npm run seed:demo          # Load demo data
```

### **Production Deployment**
```bash
npm run build              # Build optimized version
npm run start              # Start production server
```

### **Environment Variables**
Required: `DATABASE_URL`, `OPENAI_API_KEY`, `JWT_SECRET`
Optional: Redis, Sentry, Stripe, various API keys

---

## 🔄 **Version History**

### **Current Version**: 2.0.0
- **22 domain experts** with verifiable expertise
- **Unified pipeline** architecture
- **Knowledge graph** integration
- **Real-time streaming** capabilities
- **Advanced security** measures

### **Previous Versions**
- **1.x**: Legacy pipeline with separate brief/strategic implementations
- **0.x**: Initial prototype with basic agent system

---

## 🚨 **Known Limitations**

### **Technical Constraints**
- **Node.js Version**: Requires 20.x (not 24+ due to ESM/CJS issues)
- **OpenAI Rate Limits**: 3500 requests/minute per API key
- **Memory Usage**: 512MB per function limit on serverless
- **Database Connections**: 20 max concurrent connections

### **Functional Constraints**
- **Source Language**: Primarily English content (limited multilingual)
- **Real-time Data**: Dependent on provider API availability
- **PDF Processing**: Limited to text-based PDFs (no images/scans)
- **Geographic Coverage**: Stronger for US/EU, limited for some regions

---

## 📞 **Support & Maintenance**

### **Troubleshooting**
- **Build Issues**: Check Node.js version (must be 20.x)
- **Database Issues**: Verify connection string and pgbouncer settings
- **Performance**: Monitor Redis memory usage and provider health
- **API Errors**: Check OpenAI API key and rate limits

### **Maintenance Tasks**
- **Daily**: Database backups, log rotation, performance monitoring
- **Weekly**: Provider health checks, dependency updates
- **Monthly**: Security audits, performance optimization
- **Quarterly**: Architecture review, scalability assessment

---

*Last Updated: 2026-02-23*
*Version: 2.0.0*
