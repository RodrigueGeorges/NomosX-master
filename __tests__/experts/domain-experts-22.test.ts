/**
 * Tests for 22 Domain Experts System
 * 
 * Validates expert selection, knowledge base, and council management
 */

import { DOMAIN_EXPERTS, DomainExpertise } from '@/lib/agent/domain-expert';
import { knowledgeBase } from '@/lib/knowledge/multi-domain-corpus';
import { councilManager } from '@/lib/council/council-manager';

describe('22 Domain Experts System', () => {
  
  describe('Expert Registry', () => {
    test('All 22 experts properly defined', () => {
      const domains: DomainExpertise[] = [
        'economics', 'technology', 'policy', 'health', 'security', 
        'law', 'environment', 'quantitative', 'finance',
        'social-sciences', 'humanities', 'energy-advanced', 'geopolitics', 
        'cognitive-science', 'digital-society',
        'behavioral-economics', 'urban-studies', 'development-economics', 
        'computational-social-science', 'bioethics', 'complexity-science', 'risk-analysis'
      ];
      
      expect(Object.keys(DOMAIN_EXPERTS)).toHaveLength(22);
      
      domains.forEach(domain => {
        expect(DOMAIN_EXPERTS[domain]).toBeDefined();
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('id');
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('name');
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('title');
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('domain');
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('subDomains');
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('methodologies');
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('calibrationRules');
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('knownBiases');
        expect(DOMAIN_EXPERTS[domain]).toHaveProperty('frameworks');
      });
    });
    
    test('Expert names follow ethical guidelines', () => {
      Object.values(DOMAIN_EXPERTS).forEach(expert => {
        // Should not contain institutional affiliations.
        // Word boundaries avoid false positives (e.g. "Mitchell" containing "MIT").
        expect(expert.name).not.toMatch(/\b(MIT|Stanford|Oxford|Harvard|Yale|Johns Hopkins|Georgetown|ETH)\b/i);
        
        // Should contain "Analyst" instead of "PhD"
        expect(expert.title).toContain('Analyst');
        
        // Should have verifiable expertise
        expect(expert.subDomains).toBeDefined();
        expect(expert.subDomains.length).toBeGreaterThan(0);
        expect(expert.methodologies).toBeDefined();
        expect(expert.methodologies.length).toBeGreaterThan(0);
      });
    });
    
    test('Each expert has proper domain structure', () => {
      Object.entries(DOMAIN_EXPERTS).forEach(([domain, expert]) => {
        expect(expert.domain).toBe(domain);
        expect(expert.id).toContain(domain);
        expect(expert.subDomains.length).toBeGreaterThanOrEqual(3);
        expect(expert.methodologies.length).toBeGreaterThanOrEqual(3);
        expect(expert.calibrationRules.length).toBeGreaterThanOrEqual(3);
        expect(expert.knownBiases.length).toBeGreaterThanOrEqual(2);
        expect(expert.frameworks.length).toBeGreaterThanOrEqual(2);
      });
    });
  });
  
  describe('Knowledge Base Integration', () => {
    test('Knowledge base has all 22 domains', async () => {
      const stats = knowledgeBase.getCorpusStats();
      expect(stats.totalDomains).toBe(22);
      
      const domains: DomainExpertise[] = [
        'economics', 'technology', 'policy', 'health', 'security', 
        'law', 'environment', 'quantitative', 'finance',
        'social-sciences', 'humanities', 'energy-advanced', 'geopolitics', 
        'cognitive-science', 'digital-society',
        'behavioral-economics', 'urban-studies', 'development-economics', 
        'computational-social-science', 'bioethics', 'complexity-science', 'risk-analysis'
      ];
      
      domains.forEach(domain => {
        const domainStats = knowledgeBase.getCorpusStats(domain);
        expect(domainStats).toBeDefined();
        expect(domainStats.totalDocuments).toBeGreaterThan(0);
        expect(domainStats.avgQualityScore).toBeGreaterThan(70);
      });
    });
    
    test('Knowledge search returns relevant results', async () => {
      const result = await knowledgeBase.search({
        domain: 'economics',
        minQualityScore: 80,
        limit: 5
      });
      
      expect(result.documents).toBeDefined();
      expect(result.documents.length).toBeLessThanOrEqual(5);
      expect(result.totalCount).toBeGreaterThan(0);
      expect(result.domain).toBe('economics');
      expect(result.queryTime).toBeGreaterThan(0);
      
      // All documents should meet quality threshold
      result.documents.forEach(doc => {
        expect(doc.qualityScore).toBeGreaterThanOrEqual(80);
        expect(doc.domain).toBe('economics');
      });
    });
    
    test('Expert context generation works', async () => {
      const context = await knowledgeBase.getExpertContext(
        'economics',
        ['supply and demand', 'market equilibrium', 'GDP']
      );
      
      expect(context).toBeDefined();
      expect(context).toContain('ECONOMICS');
      expect(context).toContain('Key Concepts');
      expect(context).toContain('supply and demand');
      expect(context).toContain('market equilibrium');
      expect(context).toContain('GDP');
    });
  });
  
  describe('Council Manager', () => {
    test('Council manager selects optimal experts', async () => {
      const query = {
        question: 'What are the economic impacts of climate change policy?',
        sourceContext: 'Sample source context',
        sourceCount: 10,
        options: {
          maxExperts: 4,
          strategic: false,
          complexity: 'medium'
        }
      };
      
      const selection = await councilManager.selectOptimalExperts(query);
      
      expect(selection).toBeDefined();
      expect(selection.experts).toHaveLength(4);
      expect(selection.estimatedDuration).toBeGreaterThan(0);
      expect(selection.estimatedCost).toBeGreaterThan(0);
      expect(selection.qualityScore).toBeGreaterThan(0);
      expect(selection.selectionReason).toBeDefined();
      
      // Should include relevant domains
      const domains = selection.experts.map(e => e.domain);
      expect(domains).toContain('economics');
      expect(domains).toContain('environment');
    });
    
    test('Council manager handles strategic queries', async () => {
      const query = {
        question: 'Comprehensive analysis of AI governance frameworks',
        sourceContext: 'Sample source context',
        sourceCount: 15,
        options: {
          strategic: true,
          complexity: 'high'
        }
      };
      
      const selection = await councilManager.selectOptimalExperts(query);
      
      expect(selection.experts.length).toBeGreaterThan(4); // Strategic gets more experts
      expect(selection.estimatedCost).toBeGreaterThan(2.0); // Higher cost for strategic
      expect(selection.qualityScore).toBeGreaterThan(80); // Higher quality threshold
      
      // Should include technology and law domains
      const domains = selection.experts.map(e => e.domain);
      expect(domains).toContain('technology');
      expect(domains).toContain('law');
    });
    
    test('Load balancing prevents expert overload', async () => {
      // Simulate multiple concurrent requests
      const queries = Array.from({ length: 10 }, (_, i) => ({
        question: `Test query ${i}`,
        sourceContext: 'Sample context',
        sourceCount: 5,
        options: { maxExperts: 3 }
      }));
      
      const selections = await Promise.all(
        queries.map(query => councilManager.selectOptimalExperts(query))
      );
      
      // Each selection should have experts
      selections.forEach(selection => {
        expect(selection.experts).toHaveLength(3);
      });
      
      // Check load distribution
      const metrics = councilManager.getCouncilMetrics();
      expect(metrics.totalExperts).toBe(22);
      expect(metrics.avgLoad).toBeLessThan(5); // Should distribute load
    });
    
    test('Expert performance metrics update correctly', async () => {
      const expertId = 'economics-analyst';
      const initialMetrics = councilManager.getCouncilMetrics();
      const initialLoad = initialMetrics.expertDetails.find(e => e.expertId === expertId);
      
      // Simulate expert execution
      councilManager.updateExpertMetrics(expertId, 15000, true);
      
      const updatedMetrics = councilManager.getCouncilMetrics();
      const updatedLoad = updatedMetrics.expertDetails.find(e => e.expertId === expertId);
      
      expect(updatedLoad).toBeDefined();
      expect(updatedLoad!.avgResponseTime).toBeGreaterThan(0);
      expect(updatedLoad!.successRate).toBeGreaterThan(0);
    });
  });
  
  describe('Integration Tests', () => {
    test('End-to-end expert selection with knowledge base', async () => {
      const query = {
        question: 'How does machine learning impact financial markets?',
        sourceContext: 'Sample source context',
        sourceCount: 8,
        options: {
          maxExperts: 3,
          complexity: 'medium'
        }
      };
      
      // Get expert selection
      const selection = await councilManager.selectOptimalExperts(query);
      
      // Get knowledge context for selected experts
      const contexts = await Promise.all(
        selection.experts.map(expert => 
          knowledgeBase.getExpertContext(
            expert.domain as DomainExpertise,
            expert.subDomains.slice(0, 3)
          )
        )
      );
      
      expect(contexts).toHaveLength(3);
      contexts.forEach(context => {
        expect(context).toBeDefined();
        expect(context.length).toBeGreaterThan(100);
      });
      
      // Should include technology and finance domains
      const domains = selection.experts.map(e => e.domain);
      expect(domains).toContain('technology');
      expect(domains).toContain('finance');
    });
    
    test('Complex multi-domain query handling', async () => {
      const query = {
        question: 'Analyze the geopolitical implications of climate change on global financial markets and energy security',
        sourceContext: 'Sample source context',
        sourceCount: 20,
        options: {
          strategic: true,
          complexity: 'high',
          maxExperts: 6
        }
      };
      
      const selection = await councilManager.selectOptimalExperts(query);
      
      expect(selection.experts.length).toBe(6);
      expect(selection.qualityScore).toBeGreaterThan(85);
      
      // Should include multiple relevant domains
      const domains = selection.experts.map(e => e.domain);
      expect(domains).toContain('geopolitics');
      expect(domains).toContain('environment');
      expect(domains).toContain('finance');
      expect(domains).toContain('energy-advanced');
    });
  });
  
  describe('Performance Tests', () => {
    test('Expert selection completes within time limits', async () => {
      const startTime = Date.now();
      
      const query = {
        question: 'Test query for performance',
        sourceContext: 'Sample context',
        sourceCount: 10,
        options: { maxExperts: 5 }
      };
      
      const selection = await councilManager.selectOptimalExperts(query);
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(selection).toBeDefined();
      expect(selection.experts).toHaveLength(5);
    });
    
    test('Knowledge base search performance', async () => {
      const startTime = Date.now();
      
      const result = await knowledgeBase.search({
        domain: 'economics',
        limit: 10,
        minQualityScore: 80
      });
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(500); // Should complete within 500ms
      expect(result.documents).toBeDefined();
      expect(result.queryTime).toBeLessThan(100);
    });
  });
});
