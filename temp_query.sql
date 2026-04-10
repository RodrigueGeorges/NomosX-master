SELECT 
  s.title, 
  s.signalType, 
  s.summary, 
  v.name as vertical, 
  s.priorityScore, 
  s.detectedAt,
  s.noveltyScore,
  s.impactScore,
  s.confidenceScore,
  s.urgencyScore
FROM Signal s 
JOIN Vertical v ON s.verticalId = v.id 
WHERE s.status = 'NEW' 
ORDER BY s.detectedAt DESC 
LIMIT 5;
