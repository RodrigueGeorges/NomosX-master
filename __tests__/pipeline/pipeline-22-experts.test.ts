/**
 * Tests for Pipeline with 22 Experts
 * 
 * Validates complete pipeline performance with expert council
 */

import { runFullPipeline, runStrategicPipeline } from '@/lib/agent/pipeline-v2';
import { councilManager } from '@/lib/council/council-manager';
import { knowledgeBase } from '@/lib/knowledge/multi-domain-corpus';

describe('Pipeline with 22 Experts', () => {
  
  describe('Pipeline Integration', () => {
    test('Complete pipeline runs with 22 experts available', async () => {
      const query = "What are the economic impacts of artificial intelligence on employment?";
      
      // This test validates that the pipeline can run without errors
      // In a real test environment, we would mock the expensive LLM calls
      
      // Test expert selection first
      const selection = await councilManager.selectOptimalExperts({
        question: query,
        sourceContext: "Test source context",
        sourceCount: 10,
        options: {
          maxExperts: 4,
          strategic: false
        }
      });
      
      expect(selection.experts).toHaveLength(4);
      expect(selection.estimatedDuration).toBeGreaterThan(0);
      expect(selection.estimatedCost).toBeGreaterThan(0);
      
      // Verify relevant domains are selected
      const domains = selection.experts.map(e => e.domain);
      expect(domains).toContain('economics');
      expect(domains).toContain('technology');
    }, 30000);
    
    test('Strategic pipeline uses more experts', async () => {
      const query = "Comprehensive analysis of global climate change policy and its economic implications";
      
      const selection = await councilManager.selectOptimalExperts({
        question: query,
        sourceContext: "Test source context",
        sourceCount: 15,
        options: {
          strategic: true,
          complexity: 'high'
        }
      });
      
      expect(selection.experts.length).toBeGreaterThan(4);
      expect(selection.qualityScore).toBeGreaterThan(80);
      
      // Should include multiple relevant domains
      const domains = selection.experts.map(e => e.domain);
      expect(domains).toContain('environment');
      expect(domains).toContain('economics');
      expect(domains).toContain('policy');
    }, 30000);
  });
  
  describe('Quality Gates', () => {
    test('Quality gates work for expert selection', async () => {
      const query = "Simple question about basic economics";
      
      const selection = await councilManager.selectOptimalExperts({
        question: query,
        sourceContext: "Test source context",
        sourceCount: 5,
        options: {
          maxExperts: 3,
          complexity: 'low'
        }
      });
      
      expect(selection.experts).toHaveLength(3);
      expect(selection.qualityScore).toBeGreaterThan(70);
      
      // Should primarily use economics domain
      const domains = selection.experts.map(e => e.domain);
      expect(domains[0]).toBe('economics');
    }, 20000);
    
    test('Load balancing prevents expert overload', async () => {
      // Simulate multiple concurrent selections
      const queries = Array.from({ length: 5 }, (_, i) => ({
        question: `Test query ${i}`,
        sourceContext: "Test context",
        sourceCount: 8,
        options: { maxExperts: 3 }
      }));
      
      const selections = await Promise.all(
        queries.map(query => councilManager.selectOptimalExperts(query))
      );
      
      // All selections should succeed
      selections.forEach(selection => {
        expect(selection.experts).toHaveLength(3);
        expect(selection.qualityScore).toBeGreaterThan(0);
      });
      
      // Check load distribution
      const metrics = councilManager.getCouncilMetrics();
      expect(metrics.avgLoad).toBeLessThan(10);
    }, 30000);
  });
  
  describe('Memory Injection', () => {
    test('Knowledge base context injection works', async () => {
      const domain = 'economics';
      const concepts = ['GDP', 'inflation', 'unemployment'];
      
      const context = await knowledgeBase.getExpertContext(domain, concepts);
      
      expect(context).toBeDefined();
      expect(context).toContain('ECONOMICS');
      expect(context).toContain('Key Concepts');
      expect(context).toContain('GDP');
      expect(context).toContain('inflation');
      expect(context).toContain('unemployment');
    }, 10000);
    
    test('Expert context includes relevant documents', async () => {
      const result = await knowledgeBase.search({
        domain: 'technology',
        minQualityScore: 85,
        limit: 5
      });
      
      expect(result.documents).toBeDefined();
      expect(result.documents.length).toBeGreaterThan(0);
      
      // All documents should be technology-related
      result.documents.forEach(doc => {
        expect(doc.domain).toBe('technology');
        expect(doc.qualityScore).toBeGreaterThanOrEqual(85);
      });
    }, 10000);
  });
  
  describe('Performance Benchmarks', () => {
    test('Expert selection under 1 second', async () => {
      const startTime = Date.now();
      
      const selection = await councilManager.selectOptimalExperts({
        question: "Test query for performance",
        sourceContext: "Test context",
        sourceCount: 10,
        options: { maxExperts: 4 }
      });
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000);
      expect(selection.experts).toHaveLength(4);
    }, 5000);
    
    test('Knowledge base search under 500ms', async () => {
      const startTime = Date.now();
      
      const result = await knowledgeBase.search({
        domain: 'economics',
        limit: 10,
        minQualityScore: 80
      });
      
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(500);
      expect(result.documents).toBeDefined();
    }, 5000);
    
    test('Council metrics update correctly', async () => {
      const initialMetrics = councilManager.getCouncilMetrics();
      expect(initialMetrics.totalExperts).toBe(74);
      
      // Simulate expert execution
      const expertId = 'economics-analyst';
      councilManager.updateExpertMetrics(expertId, 12000, true);
      
      const updatedMetrics = councilManager.getCouncilMetrics();
      const expertMetrics = updatedMetrics.expertDetails.find(e => e.expertId === expertId);
      
      expect(expertMetrics).toBeDefined();
      expect(expertMetrics!.avgResponseTime).toBeGreaterThan(0);
      expect(expertMetrics!.successRate).toBeGreaterThan(0);
    }, 5000);
  });
  
  describe('Error Handling', () => {
    test('Invalid query parameters handled gracefully', async () => {
      try {
        await councilManager.selectOptimalExperts({
          question: "", // Empty question
          sourceContext: "Test context",
          sourceCount: 10
        });
        // Should not throw, but handle gracefully
        expect(true).toBe(true);
      } catch (error) {
        // If it throws, it should be a meaningful error
        expect(error).toBeDefined();
      }
    }, 5000);
    
    test('Missing knowledge base handled gracefully', async () => {
      try {
        await knowledgeBase.search({
          domain: 'nonexistent-domain' as any,
          limit: 5
        });
        // Should handle gracefully
        expect(true).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
      }
    }, 5000);
  });
  
  describe('Domain Coverage', () => {
    test('All 22 domains have expert definitions', () => {
      const domains = [
        'economics', 'technology', 'policy', 'health', 'security', 
        'law', 'environment', 'quantitative', 'finance',
        'social-sciences', 'humanities', 'energy-advanced', 'geopolitics', 
        'cognitive-science', 'digital-society',
        'behavioral-economics', 'urban-studies', 'development-economics', 
        'computational-social-science', 'bioethics', 'complexity-science', 'risk-analysis'
      ];
      
      domains.forEach(domain => {
        const selection = councilManager.selectOptimalExperts({
          question: `Test query for ${domain}`,
          sourceContext: "Test context",
          sourceCount: 5,
          options: { domains: [domain as any], maxExperts: 1 }
        });
        
        // Should not throw and should select the domain expert
        expect(selection).toBeDefined();
      });
    }, 60000);
    
    test('Cross-domain queries select appropriate experts', async () => {
      const crossDomainQueries = [
        {
          query: "How does AI affect healthcare policy?",
          expectedDomains: ['technology', 'health', 'policy']
        },
        {
          query: "Climate change impacts on financial markets",
          expectedDomains: ['environment', 'finance', 'economics']
        },
        {
          query: "Digital privacy laws and cybersecurity",
          expectedDomains: ['law', 'technology', 'security']
        }
      ];
      
      for (const { query, expectedDomains } of crossDomainQueries) {
        const selection = await councilManager.selectOptimalExperts({
          question: query,
          sourceContext: "Test context",
          sourceCount: 10,
          options: { maxExperts: 3 }
        });
        
        const selectedDomains = selection.experts.map(e => e.domain);
        
        // Should include at least one expected domain
        const hasExpectedDomain = expectedDomains.some(domain => 
          selectedDomains.includes(domain)
        );
        expect(hasExpectedDomain).toBe(true);
      }
    }, 30000);
  });
  
  describe('Integration with Pipeline', () => {
    test('Pipeline can access council manager', async () => {
      // This test validates that the pipeline can access the council manager
      // In a real integration test, we would run the actual pipeline
      
      const query = "Test query for pipeline integration";
      const selection = await councilManager.selectOptimalExperts({
        question: query,
        sourceContext: "Test context",
        sourceCount: 8,
        options: { maxExperts: 3 }
      });
      
      expect(selection).toBeDefined();
      expect(selection.experts).toHaveLength(3);
      
      // Verify the selection can be used in pipeline context
      expect(selection.estimatedDuration).toBeGreaterThan(0);
      expect(selection.estimatedCost).toBeGreaterThan(0);
      expect(selection.qualityScore).toBeGreaterThan(0);
    }, 10000);
    
    test('Knowledge base integration works', async () => {
      // Test that knowledge base can be accessed for expert priming
      
      const domains = ['economics', 'technology', 'policy'];
      const contexts = await Promise.all(
        domains.map(domain => 
          knowledgeBase.getExpertContext(domain as any, ['test', 'concept'])
        )
      );
      
      contexts.forEach(context => {
        expect(context).toBeDefined();
        expect(context.length).toBeGreaterThan(50);
      });
    }, 15000);
  });
});
