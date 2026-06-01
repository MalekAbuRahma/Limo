
import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, ReferenceLine
} from 'recharts';
import { Car } from '../types';
import { generateProjections } from '../utils/finance';

interface ProjectionChartProps {
  car: Car;
}

export const ProjectionChart: React.FC<ProjectionChartProps> = ({ car }) => {
  const data = generateProjections(car);

  if (!data || data.length === 0) return null;

  return (
    <div className="h-[400px] w-full bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">ROI Lifecycle Projection</h3>
        <p className="text-sm text-slate-500">Cumulative profit/loss over {car.durationYears} years</p>
      </div>
      <ResponsiveContainer width="100%" height="100%" minHeight={300}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorCumulative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="month" 
            tick={{fontSize: 10}} 
            axisLine={false} 
            tickLine={false}
            minTickGap={30}
          />
          <YAxis 
            tick={{fontSize: 10}} 
            axisLine={false} 
            tickLine={false} 
            tickFormatter={(val) => `${Math.round(val/1000)}k`}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
            formatter={(val: number) => [`${val.toLocaleString()} JOD`, 'Cumulative Net']}
          />
          <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={2} />
          <Area 
            type="monotone" 
            dataKey="cumulative" 
            stroke="#3b82f6" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorCumulative)" 
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

interface MultiCarComparisonProps {
  cars: Car[];
}

export const MultiCarComparison: React.FC<MultiCarComparisonProps> = ({ cars }) => {
  const data = cars.map(car => ({
    name: car.model,
    Rent: car.monthlyRent,
    Expenses: (Object.values(car.expenses) as number[]).reduce((a, b) => a + b, 0),
  }));

  if (data.length === 0) return null;

  return (
    <div className="h-[400px] w-full bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
       <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-800">Monthly Cash Flow Comparison</h3>
        <p className="text-sm text-slate-500">Rent vs Operational Overhead</p>
      </div>
      <ResponsiveContainer width="100%" height="100%" minHeight={300}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10}} />
          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10}} />
          <Tooltip 
            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
            formatter={(val: number) => [`${val.toLocaleString()} JOD`]}
          />
          <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
          <Bar dataKey="Rent" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={40} />
          <Bar dataKey="Expenses" fill="#94a3b8" radius={[6, 6, 0, 0]} barSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
