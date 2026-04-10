import { getDomainBySlug, getDomainsBySlugs, PREDEFINED_DOMAINS } from '../domains';

describe('Domain Utils', () => {
  describe('PREDEFINED_DOMAINS', () => {
    it('should have 8 predefined domains', () => {
      expect(PREDEFINED_DOMAINS).toHaveLength(8);
    });

    it('should have all required properties', () => {
      PREDEFINED_DOMAINS.forEach((domain) => {
        expect(domain).toHaveProperty('slug');
        expect(domain).toHaveProperty('name');
        expect(domain).toHaveProperty('nameEn');
        expect(domain).toHaveProperty('icon');
        expect(domain).toHaveProperty('color');
        expect(domain).toHaveProperty('description');
        expect(domain).toHaveProperty('keywords');
        expect(domain.keywords).toBeInstanceOf(Array);
      });
    });

    it('should have unique slugs', () => {
      const slugs = PREDEFINED_DOMAINS.map((d) => d.slug);
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);
    });
  });

  describe('getDomainBySlug', () => {
    it('should find domain by valid slug', () => {
      const domain = getDomainBySlug('economie');
      
      expect(domain).toBeDefined();
      expect(domain?.slug).toBe('economie');
      expect(domain?.name).toBe('Économie');
      expect(domain?.color).toBe('#4C6EF5');
    });

    it('should return undefined for invalid slug', () => {
      const domain = getDomainBySlug('invalid-slug');
      
      expect(domain).toBeUndefined();
    });

    it('should find all predefined domains', () => {
      const slugs = ['economie', 'science', 'ecologie', 'medecine', 'technologie', 'sociologie', 'politique', 'energie'];
      
      slugs.forEach((slug) => {
        const domain = getDomainBySlug(slug);
        expect(domain).toBeDefined();
        expect(domain?.slug).toBe(slug);
      });
    });
  });

  describe('getDomainsBySlugs', () => {
    it('should find multiple domains by slugs', () => {
      const domains = getDomainsBySlugs(['economie', 'ecologie']);
      
      expect(domains).toHaveLength(2);
      expect(domains[0].slug).toBe('economie');
      expect(domains[1].slug).toBe('ecologie');
    });

    it('should filter out invalid slugs', () => {
      const domains = getDomainsBySlugs(['economie', 'invalid', 'ecologie']);
      
      expect(domains).toHaveLength(2);
      expect(domains.map(d => d.slug)).toEqual(['economie', 'ecologie']);
    });

    it('should return empty array for all invalid slugs', () => {
      const domains = getDomainsBySlugs(['invalid1', 'invalid2']);
      
      expect(domains).toHaveLength(0);
    });

    it('should handle empty array', () => {
      const domains = getDomainsBySlugs([]);
      
      expect(domains).toHaveLength(0);
    });

    it('should preserve order', () => {
      const domains = getDomainsBySlugs(['ecologie', 'economie', 'technologie']);
      
      expect(domains[0].slug).toBe('ecologie');
      expect(domains[1].slug).toBe('economie');
      expect(domains[2].slug).toBe('technologie');
    });
  });
});
