class QueryOptimizer {
  // Batch multiple queries into single transaction
  static batchQueries(queries) {
    return {
      query: queries.map(q => q.query).join('; '),
      params: queries.flatMap(q => q.params || [])
    };
  }

  // Generate optimized pagination query
  static paginationQuery(baseQuery, page = 1, limit = 10) {
    const offset = (page - 1) * limit;
    return {
      query: `${baseQuery} LIMIT $${baseQuery.split('$').length} OFFSET $${baseQuery.split('$').length + 1}`,
      params: [limit, offset]
    };
  }

  // Generate count query from select query
  static countQuery(selectQuery) {
    return selectQuery.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
  }

  // Optimize WHERE conditions
  static buildWhereClause(filters, startParamIndex = 1) {
    const conditions = [];
    const params = [];
    let paramIndex = startParamIndex;

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        conditions.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    });

    return {
      whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
      nextParamIndex: paramIndex
    };
  }
}

export default QueryOptimizer;